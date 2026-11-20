'use strict';
// TallerYa — lógica de negocio. Todas las rutas /api/* pasan por dispatch()
// desde server.js (que es el entrypoint en vivo en Vercel, igual que en
// OnlyClick: api/*.js NO se ejecuta en producción).
const crypto = require('crypto');
const { getStore } = require('./store');
const { hashPassword, verifyPassword, signToken, verifyToken, publicUser } = require('./auth');
const { FOCOS, specialistForFocos } = require('./focos');
const { INCIDENT_TYPES, INCIDENT_LABELS, INCIDENT_COPY } = require('./seed');
const { searchPlaces, getPlaceDetails, tipoForPlaces, dedupePlaces } = require('./places');

function err(status, message) { const e = new Error(message); e.status = status; return e; }

async function currentUser(store, token) {
  const userId = verifyToken(token);
  if (!userId) return null;
  return store.findUserById(userId);
}
function requireUser(user) {
  if (!user) throw err(401, 'Inicia sesión para continuar.');
  return user;
}
function requireOwner(user) {
  requireUser(user);
  if (!user.isOwner) throw err(403, 'Solo el dueño puede hacer esto.');
  return user;
}
function isOwnerEmail(email) {
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  return !!owner && String(email || '').trim().toLowerCase() === owner;
}
function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function waLink(phone, message) {
  const p = digits(phone);
  if (!p) return '';
  return `https://wa.me/52${p}?text=${encodeURIComponent(message)}`;
}

// Distancia real entre dos puntos (km). Si no hay GPS, se usa distKm de la semilla.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function distOf(shop, lat, lng) {
  if (lat != null && lng != null && shop.lat != null && shop.lng != null) {
    return haversineKm(Number(lat), Number(lng), Number(shop.lat), Number(shop.lng));
  }
  return Number(shop.distKm || 0);
}

// Especialidad del taller (texto del formulario) → tipos que atiende.
function tiposDeEspecialidad(esp) {
  const e = String(esp || '').toLowerCase();
  if (e.includes('varias')) return ['hojalateria', 'mecanico', 'electrico', 'grua', 'llantera'];
  if (e.includes('hojalat')) return ['hojalateria'];
  if (e.includes('mecán') || e.includes('mecan')) return ['mecanico', 'electrico'];
  if (e.includes('eléc') || e.includes('elec')) return ['electrico'];
  if (e.includes('grúa') || e.includes('grua')) return ['grua'];
  if (e.includes('llant')) return ['llantera'];
  return ['mecanico'];
}
function shopMatchesTipo(shop, tipos) {
  if (!tipos || !tipos.length) return true;
  const mine = shop.tipo ? [shop.tipo] : tiposDeEspecialidad(shop.especialidad);
  return mine.some(t => tipos.includes(t));
}

// Orden de resultados (decisión de Orlan 2026-11-19):
// primero los talleres CON la app (por plan: Premium > Destacado > Básico,
// dentro del plan por calificación y luego por distancia); después los de
// Google (por distancia). Así la lista se va llenando de talleres con la
// app conforme se registran.
const PLAN_RANK = { Premium: 0, Destacado: 1, Basico: 2 };
function orderShops(appShops, googleShops, lat, lng) {
  const withDist = s => ({ ...s, distKm: distOf(s, lat, lng) });
  const app = appShops.map(withDist).sort((a, b) =>
    ((PLAN_RANK[a.plan] ?? 2) - (PLAN_RANK[b.plan] ?? 2)) ||
    ((b.rating || 0) - (a.rating || 0)) ||
    (a.distKm - b.distKm));
  const google = googleShops.map(withDist).sort((a, b) => a.distKm - b.distKm);
  return [...app, ...google];
}

function publicAppShop(w, ofertas) {
  return {
    id: w.id, source: 'app', enApp: true, nombre: w.nombre,
    esp: w.especialidad, tipos: tiposDeEspecialidad(w.especialidad),
    zona: w.zona || '', dir: w.direccion || '', tel: w.whatsapp || '',
    horario: w.horario || '', rating: Number(w.rating || 0), opiniones: w.opiniones || 0,
    plan: w.plan || 'Basico', distKm: Number(w.distKm || 0), lat: w.lat, lng: w.lng,
    abierto: true, servicios: w.servicios || '', tieneGrua: !!w.tieneGrua, aDomicilio: !!w.aDomicilio,
    costoVisita: w.costoVisita == null ? null : Number(w.costoVisita),
    ofertas: (ofertas || []).filter(o => o.activa).map(o => ({ titulo: o.titulo, precio: o.precio, vigencia: o.vigencia })),
  };
}
function validateCarros(carros) {
  if (!Array.isArray(carros)) throw err(400, 'Los carros deben ser una lista.');
  if (carros.length > 3) throw err(400, 'Solo se pueden guardar hasta 3 carros.');
  return carros.map(c => {
    const marca = String(c.marca || '').trim();
    if (!marca) throw err(400, 'Cada carro necesita su marca.');
    const anio = String(c.anio || '').trim();
    if (anio && !/^\d{4}$/.test(anio)) throw err(400, 'El año del carro debe ser de 4 números.');
    return { marca: marca.slice(0, 40), modelo: String(c.modelo || '').trim().slice(0, 40), anio, color: String(c.color || '').trim().slice(0, 30) };
  });
}

// ---------------- Auth ----------------
async function register(store, b) {
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const role = b.role === 'workshop' ? 'workshop' : 'driver';
  if (!name) throw err(400, 'Escribe tu nombre.');
  if (!validEmail(email)) throw err(400, 'Escribe un correo válido.');
  if (password.length < 6) throw err(400, 'La contraseña debe tener al menos 6 caracteres.');
  if (await store.findUserByEmail(email)) throw err(400, 'Ese correo ya tiene cuenta. Inicia sesión.');
  const tallerNombre = role === 'workshop' ? String(b.tallerNombre || name).trim() : '';
  if (role === 'workshop' && !tallerNombre) throw err(400, 'Escribe el nombre del taller.');
  // Registro de taller (decisión de Orlan 2026-11-19, corregida el
  // mismo día): el taller SE PUEDE REGISTRAR SOLO y queda EN ESPERA
  // (approved=false) hasta que Orlan va en persona a verificarlo y le
  // entrega el código; con el código el taller ACTIVA su cuenta (ver
  // activateWorkshop). El código es OPCIONAL al registrarse: si ya se
  // lo dieron antes, lo mete aquí y entra aprobado en ese momento
  // (atajo). Código inválido (no existe o ya se usó) → 400 con el
  // mismo mensaje para no dar pistas. El conductor no necesita código.
  let invite = null;
  if (role === 'workshop') {
    const inviteCode = String(b.inviteCode || '').trim().toUpperCase();
    if (inviteCode) {
      invite = await store.findInviteCodeByCode(inviteCode);
      if (!invite || invite.usedBy) throw err(400, 'Ese código no es válido.');
    }
  }
  const owner = isOwnerEmail(email);
  const user = await store.createUser({
    name, email, passwordHash: hashPassword(password), role,
    phone: String(b.phone || '').trim().slice(0, 20),
    // Sin código el taller queda en espera de la visita de Orlan.
    // Con código ya está verificado en persona: entra aprobado.
    isOwner: owner, approved: role === 'workshop' ? !!invite : true,
  });
  let workshop = null;
  if (role === 'workshop') {
    workshop = await store.createWorkshop(user.id, {
      nombre: tallerNombre, especialidad: String(b.especialidad || 'Mecánica').slice(0, 60),
      ciudad: String(b.ciudad || 'Ensenada').slice(0, 60), zona: String(b.zona || '').slice(0, 80),
      whatsapp: String(b.whatsapp || b.phone || '').trim().slice(0, 20),
      tieneGrua: !!b.tieneGrua, aDomicilio: !!b.aDomicilio,
      plan: ['Basico', 'Destacado', 'Premium'].includes(b.plan) ? b.plan : 'Basico',
      horario: '', direccion: '', servicios: '', lat: null, lng: null, distKm: 0,
    });
    // Marcar el código como usado ANTES de devolver éxito. Si falla
    // (otro registro lo usó al mismo tiempo), el registro falla también.
    // Solo cuando el taller trajo código: sin código no hay nada que marcar.
    if (invite) {
      const marked = await store.markInviteCodeUsed(invite.code, user.id);
      if (!marked) throw err(400, 'Ese código no es válido.');
    }
  }
  return { status: 201, data: { user: publicUser(user), workshop: workshop ? { id: workshop.id, nombre: workshop.nombre } : null, token: signToken(user.id) } };
}

async function login(store, b) {
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const user = await store.findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) throw err(401, 'Correo o contraseña incorrectos.');
  return { status: 200, data: { user: publicUser(user), token: signToken(user.id) } };
}

async function authStatus(store, token) {
  const user = await currentUser(store, token);
  if (!user) return { status: 200, data: { user: null } };
  let workshop = null;
  if (user.role === 'workshop') {
    const w = await store.getWorkshopByUserId(user.id);
    if (w) workshop = { id: w.id, nombre: w.nombre, plan: w.plan, activo: w.activo };
  }
  return { status: 200, data: { user: publicUser(user), workshop } };
}

// ---------------- Perfil del conductor ----------------
async function getDriverProfile(store, user) {
  requireUser(user);
  const p = await store.getDriverProfile(user.id);
  return { status: 200, data: { profile: p || { carros: [], tieneSeguro: false, aseguradora: '', poliza: '', telAseg: '' } } };
}

async function saveDriverProfile(store, user, b) {
  requireUser(user);
  const carros = validateCarros(b.carros || []);
  const profile = {
    carros,
    tieneSeguro: !!b.tieneSeguro,
    aseguradora: String(b.aseguradora || '').slice(0, 40),
    poliza: String(b.poliza || '').trim().slice(0, 40),
    telAseg: String(b.telAseg || '').trim().slice(0, 20),
  };
  const saved = await store.saveDriverProfile(user.id, profile);
  return { status: 200, data: { profile: saved } };
}

// ---------------- Búsqueda ----------------
async function search(store, query) {
  const incident = String(query.incident || 'otro');
  const tipos = incident === 'foquito'
    ? (String(query.tipo || 'mecanico') === 'electrico' ? ['electrico'] : ['mecanico'])
    : (INCIDENT_TYPES[incident] || INCIDENT_TYPES.otro);
  const lat = query.lat != null && query.lat !== '' ? Number(query.lat) : null;
  const lng = query.lng != null && query.lng !== '' ? Number(query.lng) : null;
  const appAll = await store.listApprovedWorkshops();
  const appShops = [];
  for (const w of appAll) {
    if (!shopMatchesTipo(w, tipos)) continue;
    const ofertas = await store.listOffers(w.id);
    appShops.push(publicAppShop(w, ofertas));
  }
  // Talleres reales de Google Places (api/_lib/places.js). Sin llave, o
  // si Google falla, solo salen los talleres con la app y el frente
  // muestra el aviso (googleDisponible: false). Nunca datos de ejemplo.
  let googleShops = [];
  let googleDisponible = false;
  const placesKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();
  if (placesKey) {
    try {
      const places = await searchPlaces({ tipo: tipoForPlaces(tipos), lat, lng, key: placesKey });
      googleShops = dedupePlaces(places, appShops).slice(0, 10);
      googleDisponible = true;
    } catch (_) {
      googleShops = [];
      googleDisponible = false;
    }
  }
  const shops = orderShops(appShops, googleShops, lat, lng);
  const copy = INCIDENT_COPY[incident] || INCIDENT_COPY.otro;
  return { status: 200, data: { shops, incident, resTitle: copy.resTitle, total: shops.length, appCount: appShops.length, googleDisponible } };
}

async function getShop(store, query) {
  const source = String(query.source || 'app');
  if (source === 'google') {
    // Los talleres de Google se identifican por su place id ('places:...').
    const id = String(query.id || '');
    if (!id.startsWith('places:')) throw err(404, 'Taller no encontrado.');
    const placesKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();
    if (!placesKey) throw err(404, 'Los talleres de Google se activan cuando se agregue la llave.');
    const lat = query.lat != null && query.lat !== '' ? Number(query.lat) : null;
    const lng = query.lng != null && query.lng !== '' ? Number(query.lng) : null;
    let shop = null;
    try {
      shop = await getPlaceDetails(id.slice('places:'.length), {
        key: placesKey, tipo: String(query.tipo || ''), lat, lng,
      });
    } catch (_) {
      shop = null;
    }
    if (!shop) throw err(404, 'Taller no encontrado.');
    return { status: 200, data: { shop, reviews: [] } };
  }
  const id = Number(query.id);
  const w = await store.getWorkshop(id);
  if (!w) throw err(404, 'Taller no encontrado.');
  const u = await store.findUserById(w.userId);
  if (!u || u.approved === false || w.activo === false) throw err(404, 'Taller no disponible.');
  const ofertas = await store.listOffers(w.id);
  const servicios = await store.listServices(w.id);
  return { status: 200, data: { shop: publicAppShop(w, ofertas), servicios, reviews: [] } };
}

// ---------------- Foquitos ----------------
async function listFocos() {
  return { status: 200, data: { focos: FOCOS } };
}
async function diagnosticoFocos(store, b) {
  const { focos, especialistas } = specialistForFocos(b.focos || []);
  return { status: 200, data: { focos, especialistas } };
}

// ---------------- Avisar al taller (doble aviso) ----------------
// Crea la solicitud en la base, deja la notificación en la app del taller
// y devuelve el link de WhatsApp con el mensaje ya escrito. El aviso es
// DOBLE por decisión de Orlan (2026-11-16): en la app Y por WhatsApp.
// La app NO manda el WhatsApp sola: el conductor lo abre con un toque
// (mandarlo automático requiere WhatsApp Business API de pago — v2).
async function notify(store, user, b) {
  requireUser(user);
  const workshopId = Number(b.workshopId);
  const incident = String(b.incident || 'otro');
  if (!INCIDENT_LABELS[incident]) throw err(400, 'Incidente no válido.');
  const w = await store.getWorkshop(workshopId);
  if (!w) throw err(404, 'Taller no encontrado.');
  const owner = await store.findUserById(w.userId);
  if (!owner || owner.approved === false || w.activo === false) throw err(400, 'Ese taller no está disponible ahorita.');
  const descripcion = String(b.descripcion || '').slice(0, 500);
  const carro = b.carro && typeof b.carro === 'object' ? {
    marca: String(b.carro.marca || '').slice(0, 40), modelo: String(b.carro.modelo || '').slice(0, 40),
    anio: String(b.carro.anio || '').slice(0, 4), color: String(b.carro.color || '').slice(0, 30),
  } : null;
  const lat = b.lat != null && b.lat !== '' ? Number(b.lat) : null;
  const lng = b.lng != null && b.lng !== '' ? Number(b.lng) : null;

  let fotoKey = null;
  if (b.fotoBase64) {
    const m = String(b.fotoBase64).match(/^data:(image\/(jpeg|png));base64,(.+)$/);
    if (!m) throw err(400, 'La foto debe ser JPG o PNG.');
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 2 * 1024 * 1024) throw err(400, 'La foto es muy pesada (máximo 2 MB).');
    const saved = await store.savePhoto({ buffer, filename: 'foto.jpg', mimeType: m[1] });
    fotoKey = saved.key;
  }

  const req = await store.createRequest({
    driverId: user.id, workshopId: w.id, incident, descripcion, carro, lat, lng, fotoKey,
  });
  const carroTxt = carro ? [carro.marca, carro.modelo, carro.anio, carro.color].filter(Boolean).join(' ') : 'Carro no registrado';
  await store.createNotification(w.userId, {
    titulo: `¡Nueva solicitud! ${INCIDENT_LABELS[incident]}`,
    cuerpo: `${user.name || 'Un conductor'} · ${carroTxt}${descripcion ? ' · ' + descripcion : ''}`,
  });
  await store.trackEvent(w.id, 'aviso');
  const msg = `Hola ${w.nombre}, soy ${user.name || 'un conductor'} y te aviso por TallerYa: ${INCIDENT_LABELS[incident].toLowerCase()}${descripcion ? ' — ' + descripcion : ''}. Mi carro: ${carroTxt}. ¿Me puedes ayudar?`;
  return {
    status: 201,
    data: {
      request: { id: req.id, estado: req.estado },
      taller: w.nombre,
      whatsappUrl: waLink(w.whatsapp, msg),
    },
  };
}

// ---------------- Panel del taller ----------------
async function getWorkshopOf(store, user) {
  requireUser(user);
  if (user.role !== 'workshop') throw err(403, 'Esta pantalla es solo para talleres.');
  const w = await store.getWorkshopByUserId(user.id);
  if (!w) throw err(404, 'No tienes taller registrado.');
  return w;
}

async function getPanel(store, user) {
  const w = await getWorkshopOf(store, user);
  const [solicitudes, servicios, ofertas, stats, notifs] = await Promise.all([
    store.listRequestsByWorkshop(w.id),
    store.listServices(w.id),
    store.listOffers(w.id),
    store.getStats(w.id),
    store.listNotifications(user.id),
  ]);
  const unread = notifs.filter(n => !n.leida).length;
  // Solicitudes enriquecidas para el panel: nombre y teléfono del conductor,
  // etiqueta del incidente y distancia desde el taller.
  const solicitudesOut = [];
  for (const r of solicitudes.slice(0, 50)) {
    const driver = await store.findUserById(r.driverId);
    const distKm = (r.lat != null && r.lng != null && w.lat != null && w.lng != null)
      ? haversineKm(Number(w.lat), Number(w.lng), Number(r.lat), Number(r.lng)) : null;
    solicitudesOut.push({
      ...r,
      driverName: driver ? driver.name : 'Conductor',
      driverPhone: driver ? (driver.phone || '') : '',
      incidentLabel: INCIDENT_LABELS[r.incident] || r.incident,
      distKm,
    });
  }
  return {
    status: 200,
    data: {
      taller: {
        id: w.id, nombre: w.nombre, especialidad: w.especialidad, zona: w.zona,
        whatsapp: w.whatsapp, tieneGrua: w.tieneGrua, aDomicilio: w.aDomicilio,
        plan: w.plan, activo: w.activo, horario: w.horario, direccion: w.direccion,
        serviciosTexto: w.servicios || '', rating: w.rating, opiniones: w.opiniones,
        costoVisita: w.costoVisita == null ? null : Number(w.costoVisita),
        aprobado: user.approved !== false,
      },
      solicitudes: solicitudesOut,
      servicios, ofertas, stats, unread,
      notificaciones: notifs.slice(0, 20),
    },
  };
}

async function setServices(store, user, b) {
  const w = await getWorkshopOf(store, user);
  const servicios = await store.setServices(w.id, b.servicios || []);
  return { status: 200, data: { servicios } };
}

async function createOffer(store, user, b) {
  const w = await getWorkshopOf(store, user);
  const titulo = String(b.titulo || '').trim();
  if (!titulo) throw err(400, 'Escribe el título de la oferta.');
  const o = await store.createOffer(w.id, {
    titulo: titulo.slice(0, 100),
    precio: String(b.precio || '').slice(0, 40),
    vigencia: String(b.vigencia || '').slice(0, 60),
  });
  return { status: 201, data: { oferta: o } };
}

async function setOfferActive(store, user, b) {
  const w = await getWorkshopOf(store, user);
  const o = await store.setOfferActive(Number(b.offerId), w.id, !!b.activa);
  if (!o) throw err(404, 'Oferta no encontrada.');
  return { status: 200, data: { oferta: o } };
}

async function updateWorkshopProfile(store, user, b) {
  const w = await getWorkshopOf(store, user);
  const patch = {};
  if (b.nombre !== undefined) patch.nombre = String(b.nombre).trim().slice(0, 80);
  if (b.especialidad !== undefined) patch.especialidad = String(b.especialidad).slice(0, 60);
  if (b.zona !== undefined) patch.zona = String(b.zona).slice(0, 80);
  if (b.whatsapp !== undefined) patch.whatsapp = String(b.whatsapp).trim().slice(0, 20);
  if (b.tieneGrua !== undefined) patch.tieneGrua = !!b.tieneGrua;
  if (b.aDomicilio !== undefined) patch.aDomicilio = !!b.aDomicilio;
  if (b.horario !== undefined) patch.horario = String(b.horario).slice(0, 40);
  if (b.direccion !== undefined) patch.direccion = String(b.direccion).slice(0, 120);
  if (b.servicios !== undefined) patch.servicios = String(b.servicios).slice(0, 500);
  if (b.costoVisita !== undefined) {
    const n = Number(b.costoVisita);
    patch.costoVisita = (b.costoVisita === '' || b.costoVisita === null || !Number.isFinite(n) || n < 0) ? null : n;
  }
  if (b.lat !== undefined) patch.lat = Number(b.lat) || null;
  if (b.lng !== undefined) patch.lng = Number(b.lng) || null;
  if (!patch.nombre) delete patch.nombre;
  const updated = await store.updateWorkshop(w.id, patch);
  return { status: 200, data: { taller: updated } };
}

async function setPaused(store, user, b) {
  const w = await getWorkshopOf(store, user);
  const updated = await store.updateWorkshop(w.id, { activo: !b.pausado });
  return { status: 200, data: { taller: { id: updated.id, activo: updated.activo } } };
}

// ---------------- Notificaciones ----------------
async function listNotifications(store, user) {
  requireUser(user);
  const notifs = await store.listNotifications(user.id);
  return { status: 200, data: { notificaciones: notifs, unread: notifs.filter(n => !n.leida).length } };
}
async function markNotificationsRead(store, user) {
  requireUser(user);
  const n = await store.markNotificationsRead(user.id);
  return { status: 200, data: { leidas: n } };
}

// ---------------- Estadísticas de vista/llamada ----------------
async function trackEvent(store, b) {
  const workshopId = Number(b.workshopId);
  const kind = b.kind === 'llamada' ? 'llamada' : 'vista';
  const w = await store.getWorkshop(workshopId);
  if (!w) throw err(404, 'Taller no encontrado.');
  await store.trackEvent(workshopId, kind);
  return { status: 200, data: { ok: true } };
}

// ---------------- Aprobación de talleres (dueño) ----------------
async function approveWorkshop(store, user, b) {
  requireOwner(user);
  const target = await store.findUserById(Number(b.userId));
  if (!target || target.role !== 'workshop') throw err(404, 'Taller no encontrado.');
  const updated = await store.updateUser(target.id, { approved: !!b.aprobado });
  return { status: 200, data: { user: publicUser(updated) } };
}

// ---------------- Códigos de invitación para talleres (dueño) ----------------
// Formato TALLER-XXXXXX, 6 caracteres al azar (sin 0/O/1/I/L para no
// confundirlos), nunca secuencial. Mismo alfabeto que los códigos de
// descuento de OnlyClick.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genInviteCode() {
  const bytes = crypto.randomBytes(6);
  let code = 'TALLER-';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}
function publicInviteCode(c, usedByName) {
  if (!c) return null;
  return {
    code: c.code, note: c.note || '', createdAt: c.createdAt,
    usado: !!c.usedBy, usedBy: c.usedBy || null,
    usedByName: usedByName || null, usedAt: c.usedAt || null,
  };
}
async function createInviteCode(store, user, b) {
  requireOwner(user);
  const note = String(b.note || '').trim().slice(0, 80);
  let code = null;
  for (let i = 0; i < 10; i++) {
    const cand = genInviteCode();
    if (!(await store.findInviteCodeByCode(cand))) { code = cand; break; }
  }
  if (!code) throw err(500, 'No se pudo generar el código. Intenta otra vez.');
  const row = await store.createInviteCode({ code, note, createdBy: user.id });
  return { status: 201, data: { codigo: publicInviteCode(row) } };
}
async function listInviteCodes(store, user) {
  requireOwner(user);
  const rows = await store.listInviteCodes();
  const out = [];
  for (const r of rows) {
    let usedByName = null;
    if (r.usedBy) {
      const u = await store.findUserById(r.usedBy);
      usedByName = u ? u.name : null;
    }
    out.push(publicInviteCode(r, usedByName));
  }
  return { status: 200, data: { codigos: out } };
}
async function deactivateInviteCode(store, user, b) {
  requireOwner(user);
  const code = String(b.code || '').trim().toUpperCase();
  const row = await store.findInviteCodeByCode(code);
  if (!row) throw err(404, 'Código no encontrado.');
  if (row.usedBy) throw err(400, 'Ese código ya se usó.');
  const ok = await store.deactivateInviteCode(code);
  if (!ok) throw err(404, 'Código no encontrado.');
  return { status: 200, data: { ok: true } };
}

// ---------------- Activación del taller con su código ----------------
// El taller se registra solo y queda en espera (approved=false).
// Cuando Orlan va en persona a verificarlo, le entrega el código y
// el taller lo mete aquí para ACTIVAR su cuenta. El código sirve una
// sola vez; el mismo mensaje para falta / no existe / ya se usó.
async function activateWorkshop(store, user, b) {
  requireUser(user);
  if (user.role !== 'workshop') throw err(400, 'Solo los talleres activan su cuenta con un código.');
  if (user.approved) throw err(400, 'Tu taller ya está activo.');
  const inviteCode = String(b.inviteCode || '').trim().toUpperCase();
  if (!inviteCode) throw err(400, 'Ese código no es válido.');
  const invite = await store.findInviteCodeByCode(inviteCode);
  if (!invite || invite.usedBy) throw err(400, 'Ese código no es válido.');
  // Marcar el código como usado ANTES de aprobar. Si falla (otro lo
  // usó al mismo tiempo), la activación falla también.
  const marked = await store.markInviteCodeUsed(invite.code, user.id);
  if (!marked) throw err(400, 'Ese código no es válido.');
  const updated = await store.updateUser(user.id, { approved: true });
  const w = await store.getWorkshopByUserId(user.id);
  return { status: 200, data: { user: publicUser(updated), workshop: w ? { id: w.id, nombre: w.nombre } : null } };
}

// ---------------- Talleres en espera (dueño) ----------------
// Para que Orlan sepa a quién le falta visitar: talleres registrados
// que todavía no están activos.
async function listPendingWorkshops(store, user) {
  requireOwner(user);
  const workshops = await store.listWorkshops();
  const out = [];
  for (const w of workshops) {
    const u = await store.findUserById(w.userId);
    if (!u || u.role !== 'workshop' || u.approved !== false) continue;
    out.push({
      workshopId: w.id, nombre: w.nombre, contacto: u.name,
      email: u.email, telefono: u.phone || '', registrado: u.createdAt || w.createdAt || null,
    });
  }
  return { status: 200, data: { pendientes: out } };
}

// ---------------- Foto adjunta a una solicitud ----------------
async function fotoFile(store, user, query) {
  const key = String(query.key || '');
  if (!key) throw err(400, 'Falta la foto.');
  // Solo el conductor que la mandó o el taller que la recibió pueden verla.
  const reqs = await store.listRequestsByDriver(user ? user.id : -1);
  let allowed = reqs.some(r => r.fotoKey === key);
  if (!allowed && user && user.role === 'workshop') {
    const w = await store.getWorkshopByUserId(user.id);
    if (w) {
      const mine = await store.listRequestsByWorkshop(w.id);
      allowed = mine.some(r => r.fotoKey === key);
    }
  }
  if (!allowed) throw err(403, 'No puedes ver esta foto.');
  const file = await store.getPhoto(key);
  if (!file) throw err(404, 'Foto no encontrada.');
  return { status: 200, data: null, file };
}

// ---------------- Grúa: distancia del traslado ----------------
// La grúa cobra por el traslado, así que el conductor escribe adónde
// se lleva el vehículo y la app calcula los km de ruta real (no en
// línea recta): el destino se geocodifica con Nominatim (OpenStreetMap,
// gratis, sin llave) y la ruta se calcula con OSRM (gratis, sin llave).
// Si alguno falla, el error se le muestra al conductor y la búsqueda
// sigue sin los km (no se bloquea la ayuda).
async function gruaDistancia(b) {
  const { origenLat, origenLng, destino } = b || {};
  if (origenLat == null || origenLng == null) throw err(400, 'Falta tu ubicación de recogida.');
  const dest = String(destino || '').trim();
  if (!dest) throw err(400, 'Escribe adónde se lleva el vehículo.');
  const fetchJson = async (url, headers) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await Promise.race([
        fetch(url, { headers, signal: ctrl.signal }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tardó demasiado.')), 8000)),
      ]);
      if (!r.ok) throw new Error('Respondió ' + r.status + '.');
      return r.json();
    } finally { clearTimeout(timer); }
  };
  let geo;
  try {
    geo = await fetchJson(
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=' + encodeURIComponent(dest + ', Baja California, México'),
      { 'User-Agent': 'TallerYa/1.0 (contacto: dust.since2026@gmail.com)' });
  } catch (e) {
    throw err(502, 'No pudimos buscar esa dirección ahorita. Inténtalo de nuevo.');
  }
  if (!geo || !geo.length) throw err(400, 'No encontré esa dirección. Escríbela con calle y colonia, ej. Av. Reforma 232, Independencia.');
  const destLat = parseFloat(geo[0].lat), destLng = parseFloat(geo[0].lon);
  let route;
  try {
    route = await fetchJson(
      `https://router.project-osrm.org/route/v1/driving/${origenLng},${origenLat};${destLng},${destLat}?overview=false`);
  } catch (e) {
    throw err(502, 'No pudimos calcular la distancia ahorita. Inténtalo de nuevo.');
  }
  if (!route.routes || !route.routes.length) throw err(400, 'No hay ruta entre esos dos puntos.');
  const km = Math.round(route.routes[0].distance / 100) / 10;
  return { status: 200, data: { km, destino: geo[0].display_name, destinoLat: destLat, destinoLng: destLng } };
}

// ---------------- Dispatch ----------------
async function dispatch(route, req) {
  const store = getStore();
  const user = await currentUser(store, req.token);
  const b = req.body || {};
  switch (route) {
    case 'register': return register(store, b);
    case 'login': return login(store, b);
    case 'auth-status': return authStatus(store, req.token);
    case 'get-driver-profile': return getDriverProfile(store, user);
    case 'save-driver-profile': return saveDriverProfile(store, user, b);
    case 'search': return search(store, req.query || {});
    case 'get-shop': return getShop(store, req.query || {});
    case 'list-focos': return listFocos();
    case 'diagnostico-focos': return diagnosticoFocos(store, b);
    case 'notify': return notify(store, user, b);
    case 'get-panel': return getPanel(store, user);
    case 'set-services': return setServices(store, user, b);
    case 'create-offer': return createOffer(store, user, b);
    case 'set-offer-active': return setOfferActive(store, user, b);
    case 'update-workshop-profile': return updateWorkshopProfile(store, user, b);
    case 'set-paused': return setPaused(store, user, b);
    case 'list-notifications': return listNotifications(store, user);
    case 'mark-notifications-read': return markNotificationsRead(store, user);
    case 'track-event': return trackEvent(store, b);
    case 'approve-workshop': return approveWorkshop(store, user, b);
    case 'invite-code-create': return createInviteCode(store, user, b);
    case 'invite-codes-list': return listInviteCodes(store, user);
    case 'invite-code-deactivate': return deactivateInviteCode(store, user, b);
    case 'activate-workshop': return activateWorkshop(store, user, b);
    case 'pending-workshops-list': return listPendingWorkshops(store, user);
    case 'grua-distancia': return gruaDistancia(b);
    case 'foto-file': return fotoFile(store, user, req.query || {});
    default: throw err(404, 'Ruta no encontrada.');
  }
}

module.exports = { dispatch, orderShops, haversineKm, tiposDeEspecialidad, shopMatchesTipo, INCIDENT_TYPES };
