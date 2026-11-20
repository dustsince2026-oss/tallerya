'use strict';
// Capa de datos con dos adaptadores y la misma interfaz (patrón OnlyClick):
//
// 1) Archivo local (por defecto, sin variables de entorno):
//    guarda en data/db.json y data/uploads/. Sirve para probar en local.
//    EN VERCEL NO SIRVE COMO DATO COMPARTIDO: el sistema de archivos de
//    las funciones serverless es efímero y no se comparte entre usuarios.
//    Es solo para desarrollo local. Para los tests se puede apuntar a
//    otro directorio con TALLERYA_DATA_DIR.
//
// 2) Supabase (producción en Vercel): pon SUPABASE_URL y
//    SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Vercel y
//    crea las tablas con sql/schema.sql. Los talleres de Google ya NO
//    salen de la tabla google_shops (quedó vacía tras
//    sql/quitar-talleres-ejemplo.sql): vienen reales de Google Places
//    (api/_lib/places.js, llave GOOGLE_PLACES_API_KEY).
//    Las fotos van al bucket "fotos".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.TALLERYA_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// ---------------- Adaptador de archivo local ----------------
function emptyDb() {
  return {
    users: [], driverProfiles: [], workshops: [], services: [], offers: [],
    requests: [], notifications: [], events: [], googleShops: [], inviteCodes: [],
    seq: { user: 1, workshop: 1, service: 1, offer: 1, request: 1, notification: 1, event: 1, googleShop: 1, inviteCode: 1 },
  };
}
function loadDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    for (const k of Object.keys(emptyDb())) if (db[k] === undefined) db[k] = emptyDb()[k];
    return db;
  } catch (_) {
    return emptyDb();
  }
}
function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function nextId(db, kind) { const id = db.seq[kind]; db.seq[kind] += 1; return id; }
function now() { return new Date().toISOString(); }

const fileStore = {
  kind: 'file',

  // ---- Usuarios ----
  async createUser(u) {
    const db = loadDb();
    const row = { id: nextId(db, 'user'), createdAt: now(), approved: true, isOwner: false, ...u };
    db.users.push(row); saveDb(db); return { ...row };
  },
  async findUserByEmail(email) {
    const db = loadDb();
    return db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase()) || null;
  },
  async findUserById(id) {
    return loadDb().users.find(u => u.id === Number(id)) || null;
  },
  async updateUser(id, patch) {
    const db = loadDb();
    const u = db.users.find(x => x.id === Number(id));
    if (!u) return null;
    Object.assign(u, patch); saveDb(db); return { ...u };
  },

  // ---- Perfil del conductor ----
  async getDriverProfile(userId) {
    return loadDb().driverProfiles.find(p => p.userId === Number(userId)) || null;
  },
  async saveDriverProfile(userId, profile) {
    const db = loadDb();
    let p = db.driverProfiles.find(x => x.userId === Number(userId));
    if (!p) { p = { userId: Number(userId), updatedAt: now() }; db.driverProfiles.push(p); }
    Object.assign(p, profile, { updatedAt: now() });
    saveDb(db); return { ...p };
  },

  // ---- Talleres con la app ----
  async createWorkshop(userId, w) {
    const db = loadDb();
    const row = {
      id: nextId(db, 'workshop'), userId: Number(userId), createdAt: now(),
      rating: 0, opiniones: 0, plan: 'Basico', activo: true, ...w,
    };
    db.workshops.push(row); saveDb(db); return { ...row };
  },
  async getWorkshopByUserId(userId) {
    return loadDb().workshops.find(w => w.userId === Number(userId)) || null;
  },
  async getWorkshop(id) {
    return loadDb().workshops.find(w => w.id === Number(id)) || null;
  },
  async updateWorkshop(id, patch) {
    const db = loadDb();
    const w = db.workshops.find(x => x.id === Number(id));
    if (!w) return null;
    Object.assign(w, patch); saveDb(db); return { ...w };
  },
  async listWorkshops() {
    return loadDb().workshops.slice().sort((a, b) => a.id - b.id);
  },
  async listApprovedWorkshops() {
    const db = loadDb();
    return db.workshops.filter(w => {
      const u = db.users.find(x => x.id === w.userId);
      return u && u.approved !== false && w.activo !== false;
    });
  },

  // ---- Servicios y ofertas del taller ----
  async listServices(workshopId) {
    return loadDb().services.filter(s => s.workshopId === Number(workshopId)).sort((a, b) => a.id - b.id);
  },
  async setServices(workshopId, arr) {
    const db = loadDb();
    db.services = db.services.filter(s => s.workshopId !== Number(workshopId));
    const out = [];
    for (const s of (arr || [])) {
      if (!s.nombre) continue;
      const row = { id: nextId(db, 'service'), workshopId: Number(workshopId), nombre: String(s.nombre).slice(0, 80), precio: String(s.precio || '').slice(0, 40), createdAt: now() };
      db.services.push(row); out.push(row);
    }
    saveDb(db); return out;
  },
  async listOffers(workshopId) {
    return loadDb().offers.filter(o => o.workshopId === Number(workshopId)).sort((a, b) => b.id - a.id);
  },
  async createOffer(workshopId, o) {
    const db = loadDb();
    const row = { id: nextId(db, 'offer'), workshopId: Number(workshopId), activa: true, createdAt: now(), ...o };
    db.offers.push(row); saveDb(db); return { ...row };
  },
  async setOfferActive(offerId, workshopId, activa) {
    const db = loadDb();
    const o = db.offers.find(x => x.id === Number(offerId) && x.workshopId === Number(workshopId));
    if (!o) return null;
    o.activa = !!activa; saveDb(db); return { ...o };
  },

  // ---- Solicitudes (avisos) ----
  async createRequest(r) {
    const db = loadDb();
    const row = { id: nextId(db, 'request'), estado: 'nueva', createdAt: now(), ...r };
    db.requests.push(row); saveDb(db); return { ...row };
  },
  async getRequest(id) {
    return loadDb().requests.find(r => r.id === Number(id)) || null;
  },
  async listRequestsByWorkshop(workshopId) {
    return loadDb().requests.filter(r => r.workshopId === Number(workshopId)).sort((a, b) => b.id - a.id);
  },
  async listRequestsByDriver(driverId) {
    return loadDb().requests.filter(r => r.driverId === Number(driverId)).sort((a, b) => b.id - a.id);
  },

  // ---- Notificaciones en la app ----
  async createNotification(userId, n) {
    const db = loadDb();
    const row = { id: nextId(db, 'notification'), userId: Number(userId), leida: false, createdAt: now(), ...n };
    db.notifications.push(row); saveDb(db); return { ...row };
  },
  async listNotifications(userId) {
    return loadDb().notifications.filter(n => n.userId === Number(userId)).sort((a, b) => b.id - a.id).slice(0, 50);
  },
  async markNotificationsRead(userId) {
    const db = loadDb();
    let n = 0;
    for (const x of db.notifications) if (x.userId === Number(userId) && !x.leida) { x.leida = true; n++; }
    if (n) saveDb(db);
    return n;
  },

  // ---- Estadísticas simples del taller ----
  async trackEvent(workshopId, kind) {
    const db = loadDb();
    const row = { id: nextId(db, 'event'), workshopId: Number(workshopId), kind, createdAt: now() };
    db.events.push(row); saveDb(db); return row;
  },
  async getStats(workshopId) {
    const db = loadDb();
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const ev = db.events.filter(e => e.workshopId === Number(workshopId) && new Date(e.createdAt).getTime() >= since);
    const avisos = db.requests.filter(r => r.workshopId === Number(workshopId) && new Date(r.createdAt).getTime() >= since).length;
    return {
      vistas7d: ev.filter(e => e.kind === 'vista').length,
      llamadas7d: ev.filter(e => e.kind === 'llamada').length,
      avisos7d: avisos,
    };
  },

  // ---- Listados de Google (LEGADO, ya no se usa) ----
  // Antes aquí se sembraban 3 talleres de ejemplo. Desde la integración
  // con Google Places (api/_lib/places.js) los talleres de Google son
  // reales y vienen de la API, no de esta tabla. Se deja el método para
  // no romper la interfaz del adaptador; siempre devuelve lista vacía.
  async listGoogleShops() {
    return [];
  },

  // ---- Códigos de invitación para talleres ----
  // Solo entran talleres verificados por el dueño en persona: él genera
  // el código, lo entrega en el taller y el taller lo mete al registrarse.
  // Un código sirve una sola vez. Ver sql/codigos-invitacion.sql.
  async createInviteCode(c) {
    const db = loadDb();
    const row = {
      id: nextId(db, 'inviteCode'), code: c.code, note: String(c.note || ''),
      createdBy: c.createdBy != null ? Number(c.createdBy) : null,
      usedBy: null, usedAt: null, createdAt: now(),
    };
    db.inviteCodes.push(row); saveDb(db); return { ...row };
  },
  async findInviteCodeByCode(code) {
    return loadDb().inviteCodes.find(x => x.code === String(code)) || null;
  },
  async listInviteCodes() {
    return loadDb().inviteCodes.slice().sort((a, b) => b.id - a.id);
  },
  async markInviteCodeUsed(code, userId) {
    const db = loadDb();
    const row = db.inviteCodes.find(x => x.code === String(code));
    if (!row || row.usedBy) return null;
    row.usedBy = Number(userId); row.usedAt = now();
    saveDb(db); return { ...row };
  },
  async deactivateInviteCode(code) {
    const db = loadDb();
    const i = db.inviteCodes.findIndex(x => x.code === String(code));
    if (i < 0 || db.inviteCodes[i].usedBy) return false;
    db.inviteCodes.splice(i, 1); saveDb(db); return true;
  },

  // ---- Fotos (opcionales, adjuntas a una solicitud) ----
  async savePhoto({ buffer, filename, mimeType }) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safe = String(filename || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, key), buffer);
    return { key, mimeType };
  },
  async getPhoto(key) {
    const safe = String(key || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe || safe !== key) return null;
    try {
      const bytes = fs.readFileSync(path.join(UPLOAD_DIR, safe));
      const mimeType = /\.png$/i.test(safe) ? 'image/png' : 'image/jpeg';
      return { bytes, mimeType };
    } catch (_) { return null; }
  },
};

// ---------------- Adaptador Supabase ----------------
let supabaseClient = null;
function supabase() {
  if (supabaseClient) return supabaseClient;
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  let createClient;
  try { ({ createClient } = require('@supabase/supabase-js')); } catch (_) {
    throw new Error('Falta instalar @supabase/supabase-js (npm install).');
  }
  supabaseClient = createClient(url, key, { auth: { persistSession: false } });
  return supabaseClient;
}
function mapUser(r) {
  if (!r) return null;
  return { id: r.id, name: r.name, email: r.email, passwordHash: r.password_hash, role: r.role, phone: r.phone || '', isOwner: !!r.is_owner, approved: r.approved !== false, createdAt: r.created_at };
}
function mapWorkshop(r) {
  if (!r) return null;
  return {
    id: r.id, userId: r.user_id, nombre: r.nombre, especialidad: r.especialidad, ciudad: r.ciudad,
    zona: r.zona, whatsapp: r.whatsapp, tieneGrua: !!r.tiene_grua, aDomicilio: !!r.a_domicilio,
    plan: r.plan, activo: r.activo !== false, rating: Number(r.rating || 0), opiniones: r.opiniones || 0,
    horario: r.horario, direccion: r.direccion, servicios: r.servicios || '',
    lat: r.lat, lng: r.lng, distKm: Number(r.dist_km || 0), createdAt: r.created_at,
  };
}
function mapRequest(r) {
  if (!r) return null;
  return {
    id: r.id, driverId: r.driver_id, workshopId: r.workshop_id, incident: r.incident,
    descripcion: r.descripcion || '', carro: r.carro || null, lat: r.lat, lng: r.lng,
    fotoKey: r.foto_key || null, estado: r.estado, createdAt: r.created_at,
  };
}
function mapInviteCode(r) {
  if (!r) return null;
  return {
    id: r.id, code: r.code, note: r.note || '', createdBy: r.created_by,
    usedBy: r.used_by, usedAt: r.used_at, createdAt: r.created_at,
  };
}

const supabaseStore = {
  kind: 'supabase',

  async createUser(u) {
    const { data, error } = await supabase().from('users').insert({
      name: u.name, email: u.email, password_hash: u.passwordHash, role: u.role,
      phone: u.phone || '', is_owner: !!u.isOwner, approved: u.approved !== false,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapUser(data);
  },
  async findUserByEmail(email) {
    const { data } = await supabase().from('users').select().ilike('email', email).maybeSingle();
    return mapUser(data);
  },
  async findUserById(id) {
    const { data } = await supabase().from('users').select().eq('id', id).maybeSingle();
    return mapUser(data);
  },
  async updateUser(id, patch) {
    const p = {};
    if (patch.approved !== undefined) p.approved = patch.approved;
    if (patch.isOwner !== undefined) p.is_owner = patch.isOwner;
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.phone !== undefined) p.phone = patch.phone;
    const { data, error } = await supabase().from('users').update(p).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return mapUser(data);
  },

  async getDriverProfile(userId) {
    const { data } = await supabase().from('driver_profiles').select().eq('user_id', userId).maybeSingle();
    if (!data) return null;
    return { userId: data.user_id, carros: data.carros || [], tieneSeguro: !!data.tiene_seguro, aseguradora: data.aseguradora || '', poliza: data.poliza || '', telAseg: data.tel_aseg || '', updatedAt: data.updated_at };
  },
  async saveDriverProfile(userId, profile) {
    const row = {
      user_id: userId, carros: profile.carros || [], tiene_seguro: !!profile.tieneSeguro,
      aseguradora: profile.aseguradora || '', poliza: profile.poliza || '', tel_aseg: profile.telAseg || '',
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase().from('driver_profiles').upsert(row, { onConflict: 'user_id' }).select().single();
    if (error) throw new Error(error.message);
    return { userId: data.user_id, carros: data.carros || [], tieneSeguro: !!data.tiene_seguro, aseguradora: data.aseguradora || '', poliza: data.poliza || '', telAseg: data.tel_aseg || '', updatedAt: data.updated_at };
  },

  async createWorkshop(userId, w) {
    const { data, error } = await supabase().from('workshops').insert({
      user_id: userId, nombre: w.nombre, especialidad: w.especialidad, ciudad: w.ciudad || 'Ensenada',
      zona: w.zona || '', whatsapp: w.whatsapp || '', tiene_grua: !!w.tieneGrua, a_domicilio: !!w.aDomicilio,
      plan: w.plan || 'Basico', activo: true, rating: 0, opiniones: 0,
      horario: w.horario || '', direccion: w.direccion || '', servicios: w.servicios || '',
      lat: w.lat || null, lng: w.lng || null, dist_km: w.distKm || 0,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapWorkshop(data);
  },
  async getWorkshopByUserId(userId) {
    const { data } = await supabase().from('workshops').select().eq('user_id', userId).maybeSingle();
    return mapWorkshop(data);
  },
  async getWorkshop(id) {
    const { data } = await supabase().from('workshops').select().eq('id', id).maybeSingle();
    return mapWorkshop(data);
  },
  async updateWorkshop(id, patch) {
    const p = {};
    if (patch.nombre !== undefined) p.nombre = patch.nombre;
    if (patch.especialidad !== undefined) p.especialidad = patch.especialidad;
    if (patch.zona !== undefined) p.zona = patch.zona;
    if (patch.whatsapp !== undefined) p.whatsapp = patch.whatsapp;
    if (patch.tieneGrua !== undefined) p.tiene_grua = !!patch.tieneGrua;
    if (patch.aDomicilio !== undefined) p.a_domicilio = !!patch.aDomicilio;
    if (patch.plan !== undefined) p.plan = patch.plan;
    if (patch.activo !== undefined) p.activo = !!patch.activo;
    if (patch.horario !== undefined) p.horario = patch.horario;
    if (patch.direccion !== undefined) p.direccion = patch.direccion;
    if (patch.servicios !== undefined) p.servicios = patch.servicios;
    if (patch.lat !== undefined) p.lat = patch.lat;
    if (patch.lng !== undefined) p.lng = patch.lng;
    if (patch.distKm !== undefined) p.dist_km = patch.distKm;
    const { data, error } = await supabase().from('workshops').update(p).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return mapWorkshop(data);
  },
  async listWorkshops() {
    const { data } = await supabase().from('workshops').select().order('id');
    return (data || []).map(mapWorkshop);
  },
  async listApprovedWorkshops() {
    const { data } = await supabase().from('workshops').select('*, users!inner(approved)').eq('activo', true).eq('users.approved', true);
    return (data || []).map(mapWorkshop);
  },

  async listServices(workshopId) {
    const { data } = await supabase().from('services').select().eq('workshop_id', workshopId).order('id');
    return (data || []).map(r => ({ id: r.id, workshopId: r.workshop_id, nombre: r.nombre, precio: r.precio }));
  },
  async setServices(workshopId, arr) {
    await supabase().from('services').delete().eq('workshop_id', workshopId);
    const rows = (arr || []).filter(s => s.nombre).map(s => ({ workshop_id: workshopId, nombre: String(s.nombre).slice(0, 80), precio: String(s.precio || '').slice(0, 40) }));
    if (!rows.length) return [];
    const { data, error } = await supabase().from('services').insert(rows).select();
    if (error) throw new Error(error.message);
    return (data || []).map(r => ({ id: r.id, workshopId: r.workshop_id, nombre: r.nombre, precio: r.precio }));
  },
  async listOffers(workshopId) {
    const { data } = await supabase().from('offers').select().eq('workshop_id', workshopId).order('id', { ascending: false });
    return (data || []).map(r => ({ id: r.id, workshopId: r.workshop_id, titulo: r.titulo, precio: r.precio, vigencia: r.vigencia, activa: !!r.activa, createdAt: r.created_at }));
  },
  async createOffer(workshopId, o) {
    const { data, error } = await supabase().from('offers').insert({
      workshop_id: workshopId, titulo: o.titulo, precio: o.precio || '', vigencia: o.vigencia || '', activa: true,
    }).select().single();
    if (error) throw new Error(error.message);
    return { id: data.id, workshopId: data.workshop_id, titulo: data.titulo, precio: data.precio, vigencia: data.vigencia, activa: !!data.activa, createdAt: data.created_at };
  },
  async setOfferActive(offerId, workshopId, activa) {
    const { data, error } = await supabase().from('offers').update({ activa: !!activa }).eq('id', offerId).eq('workshop_id', workshopId).select().single();
    if (error) throw new Error(error.message);
    return { id: data.id, workshopId: data.workshop_id, titulo: data.titulo, precio: data.precio, vigencia: data.vigencia, activa: !!data.activa, createdAt: data.created_at };
  },

  async createRequest(r) {
    const { data, error } = await supabase().from('requests').insert({
      driver_id: r.driverId, workshop_id: r.workshopId, incident: r.incident, descripcion: r.descripcion || '',
      carro: r.carro || null, lat: r.lat || null, lng: r.lng || null, foto_key: r.fotoKey || null, estado: 'nueva',
    }).select().single();
    if (error) throw new Error(error.message);
    return mapRequest(data);
  },
  async getRequest(id) {
    const { data } = await supabase().from('requests').select().eq('id', id).maybeSingle();
    return mapRequest(data);
  },
  async listRequestsByWorkshop(workshopId) {
    const { data } = await supabase().from('requests').select().eq('workshop_id', workshopId).order('id', { ascending: false });
    return (data || []).map(mapRequest);
  },
  async listRequestsByDriver(driverId) {
    const { data } = await supabase().from('requests').select().eq('driver_id', driverId).order('id', { ascending: false });
    return (data || []).map(mapRequest);
  },

  async createNotification(userId, n) {
    const { data, error } = await supabase().from('notifications').insert({ user_id: userId, titulo: n.titulo, cuerpo: n.cuerpo || '' }).select().single();
    if (error) throw new Error(error.message);
    return { id: data.id, userId: data.user_id, titulo: data.titulo, cuerpo: data.cuerpo, leida: !!data.leida, createdAt: data.created_at };
  },
  async listNotifications(userId) {
    const { data } = await supabase().from('notifications').select().eq('user_id', userId).order('id', { ascending: false }).limit(50);
    return (data || []).map(r => ({ id: r.id, userId: r.user_id, titulo: r.titulo, cuerpo: r.cuerpo, leida: !!r.leida, createdAt: r.created_at }));
  },
  async markNotificationsRead(userId) {
    const { count, error } = await supabase().from('notifications').update({ leida: true }, { count: 'exact' }).eq('user_id', userId).eq('leida', false);
    if (error) throw new Error(error.message);
    return count || 0;
  },

  async trackEvent(workshopId, kind) {
    await supabase().from('workshop_events').insert({ workshop_id: workshopId, kind });
    return { workshopId, kind };
  },
  async getStats(workshopId) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: ev } = await supabase().from('workshop_events').select('kind').eq('workshop_id', workshopId).gte('created_at', since);
    const { count } = await supabase().from('requests').select('id', { count: 'exact', head: true }).eq('workshop_id', workshopId).gte('created_at', since);
    return {
      vistas7d: (ev || []).filter(e => e.kind === 'vista').length,
      llamadas7d: (ev || []).filter(e => e.kind === 'llamada').length,
      avisos7d: count || 0,
    };
  },

  // ---- Listados de Google (LEGADO, ya no se usa) ----
  // La tabla google_shops quedó vacía tras sql/quitar-talleres-ejemplo.sql.
  // Los talleres de Google ahora son reales y vienen de Google Places
  // (api/_lib/places.js). Se deja el método para no romper la interfaz.
  async listGoogleShops() {
    const { data } = await supabase().from('google_shops').select().order('id');
    return (data || []).map(r => ({
      id: r.id, nombre: r.nombre, esp: r.especialidad, tipo: r.tipo, enApp: false,
      distKm: Number(r.dist_km || 0), lat: r.lat, lng: r.lng, abierto: true, horario: r.horario || '',
      rating: Number(r.rating || 0), opiniones: r.opiniones || 0, plan: 'Básico', zona: r.zona || '',
      servicios: r.servicios || '', tel: r.telefono || '', dir: r.direccion || '', reviews: [],
    }));
  },

  // ---- Códigos de invitación para talleres ----
  // Ver sql/codigos-invitacion.sql. Un código sirve una sola vez.
  async createInviteCode(c) {
    const { data, error } = await supabase().from('invite_codes').insert({
      code: c.code, note: String(c.note || ''), created_by: c.createdBy != null ? Number(c.createdBy) : null,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapInviteCode(data);
  },
  async findInviteCodeByCode(code) {
    const { data } = await supabase().from('invite_codes').select().eq('code', String(code)).maybeSingle();
    return mapInviteCode(data);
  },
  async listInviteCodes() {
    const { data } = await supabase().from('invite_codes').select().order('id', { ascending: false });
    return (data || []).map(mapInviteCode);
  },
  async markInviteCodeUsed(code, userId) {
    // El .is('used_by', null) hace que solo gane el primero si dos
    // registros llegan al mismo tiempo con el mismo código.
    const { data, error } = await supabase().from('invite_codes')
      .update({ used_by: Number(userId), used_at: new Date().toISOString() })
      .eq('code', String(code)).is('used_by', null).select().maybeSingle();
    if (error || !data) return null;
    return mapInviteCode(data);
  },
  async deactivateInviteCode(code) {
    const { count, error } = await supabase().from('invite_codes')
      .delete({ count: 'exact' }).eq('code', String(code)).is('used_by', null);
    if (error) throw new Error(error.message);
    return (count || 0) > 0;
  },

  async savePhoto({ buffer, filename, mimeType }) {
    const safe = String(filename || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
    const { error } = await supabase().storage.from('fotos').upload(key, buffer, { contentType: mimeType || 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    return { key, mimeType };
  },
  async getPhoto(key) {
    const { data, error } = await supabase().storage.from('fotos').download(key);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    return { bytes, mimeType: data.type || 'image/jpeg' };
  },
};

function getStore() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return supabaseStore;
  return fileStore;
}

module.exports = { getStore, fileStore, supabaseStore };
