'use strict';
/* TallerYa — app de una sola página. Habla con /api/* (server.js).
   Sesión: token en localStorage, se manda como Bearer en cada llamada. */
const TOKEN_KEY = 'tallerya_token';

let user = null;          // {id, name, email, role, phone, isOwner, approved}
let workshop = null;      // {id, nombre, plan, activo} si el usuario es taller
let profile = null;       // perfil del conductor: {carros, tieneSeguro, aseguradora, poliza, telAseg}
let incident = null;      // incidente elegido {k, label, tipo, ...}
let choqueModo = null;   // cómo quiere la ayuda al chocar (ver CHOQUE_MODOS)
let mecanicoModo = null; // cómo quiere la ayuda al no arrancar (ver MECANICO_MODOS)
let llanteraModo = null; // cómo quiere la ayuda de llantera (ver LLANTERA_MODOS)
let gruaKm = null;       // km del traslado de la grúa (recogida → destino)
let gruaDestino = '';    // adónde se lleva el vehículo (texto del conductor)
let gruaOrigen = 'gps';  // 'gps' = mi ubicación actual | 'manual' = dirección escrita
let gruaOrigenTxt = 'Mi ubicación actual'; // dirección que se muestra y se manda al taller
let domicilioOrigen = 'gps'; // igual que la grúa: 'gps' = donde estás | 'manual' = domicilio escrito a mano
let domicilioTxt = 'Mi ubicación actual'; // domicilio del servicio a domicilio
let domicilioLat = null, domicilioLng = null; // coordenadas del domicilio (para buscar talleres cerca de ahí)
let results = [];
let currentShop = null;
let carroElegido = null;
let carrosVisibles = 1;
let lat = null, lng = null;
// Mapa de resultados (Leaflet + OpenStreetMap, gratis y sin llave).
// Ensenada, centro, para cuando el conductor no comparte su ubicación.
const ENSENADA = [31.866, -116.596];
let mapa = null, marcadorYo = null, watchId = null;
let fotoDataUrl = null;   // foto opcional del daño (data URL, máx 2 MB)
let focosSel = {};
let FOCOS = [];

const INCIDENTS = [
  { k: 'choque', label: '🚗 Choqué', sub: 'Carrocería/hojalatería', tipo: 'hojalateria',
    buscar: 'Buscar taller ahora', resTitle: 'Talleres de carrocería/hojalatería cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte el taller de carrocería/hojalatería más cercano.' },
  { k: 'noarranca', label: '🔧 No arranca', sub: 'Mecánico o eléctrico', tipo: 'mecanico',
    buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte el taller más cercano.' },
  { k: 'grua', label: '🚛 Necesito grúa', sub: 'Arrastre al taller o a tu casa', tipo: 'grua',
    buscar: 'Buscar grúas cercanas', resTitle: 'Grúas cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte la grúa más cercana.' },
  { k: 'llantera', label: '🛞 Llantera', sub: 'Llantas, ponchadura, balanceo', tipo: 'llantera',
    buscar: 'Buscar llanteras cercanas', resTitle: 'Llanteras cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte la llantera más cercana.' },
  { k: 'otro', label: '❓ Otro problema', sub: 'Descríbelo con tus palabras', tipo: 'otro',
    buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti',
    datosNote: 'Descríbenos qué le pasa a tu carro para buscarte el taller adecuado.' },
  { k: 'foquito', label: '💡 Se prendió un foquito', sub: 'Tómale foto al tablero y te digo qué es', tipo: 'foquito',
    buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte el taller más cercano.' },
];

/* ---------- Utilidades ---------- */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 2600);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function qid(id) {
  // Un id dentro de un onclick="..." (los de Google son 'places:ChIJ...').
  return "'" + String(id).replace(/'/g, "\\'") + "'";
}
function stars(r) {
  const full = Math.round(r || 0); let s = '';
  for (let i = 0; i < 5; i++) s += (i < full) ? '★' : '☆';
  return s;
}
function carroLabel(c) {
  if (!c) return '';
  return [c.marca, c.modelo, c.anio, c.color].filter(Boolean).join(' ');
}
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

async function api(path, opts) {
  const o = opts || {};
  const res = await fetch(path, {
    method: o.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'Error del servidor.');
    e.status = res.status;
    if (res.status === 401) logout(true);
    throw e;
  }
  return data;
}

/* ---------- Auth ---------- */
let authMode = 'login';
let authRole = 'driver';
function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('segLogin').classList.toggle('sel', mode === 'login');
  document.getElementById('segRegister').classList.toggle('sel', mode === 'register');
  document.getElementById('authTitle').textContent = mode === 'login' ? 'Entra a TallerYa' : 'Crea tu cuenta';
  document.getElementById('authBtn').textContent = mode === 'login' ? 'Entrar' : 'Registrarme';
  document.getElementById('regNameBox').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('regRoleBox').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('regTallerBox').style.display = (mode === 'register' && authRole === 'workshop') ? 'block' : 'none';
  document.getElementById('authErr').textContent = '';
}
function setRole(role) {
  authRole = role;
  document.getElementById('roleDriver').classList.toggle('sel', role === 'driver');
  document.getElementById('roleWorkshop').classList.toggle('sel', role === 'workshop');
  document.getElementById('regTallerBox').style.display = (authMode === 'register' && role === 'workshop') ? 'block' : 'none';
}
async function doAuth() {
  const errEl = document.getElementById('authErr');
  errEl.textContent = '';
  const email = document.getElementById('aEmail').value.trim();
  const password = document.getElementById('aPass').value;
  try {
    let data;
    if (authMode === 'login') {
      data = await api('/api/auth-login', { method: 'POST', body: { email, password } });
    } else {
      const body = {
        name: document.getElementById('aNombre').value.trim(),
        email, password, role: authRole,
      };
      if (authRole === 'workshop') {
        body.tallerNombre = document.getElementById('aTallerNombre').value.trim();
        body.especialidad = document.getElementById('aEspecialidad').value;
        body.zona = document.getElementById('aZona').value.trim();
        body.whatsapp = document.getElementById('aWa').value.trim();
        body.tieneGrua = document.getElementById('aGrua').checked;
        body.aDomicilio = document.getElementById('aDomicilio').checked;
        body.plan = document.getElementById('aPlan').value;
        body.inviteCode = document.getElementById('aCodigo').value.trim();
      }
      data = await api('/api/auth-register', { method: 'POST', body });
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    user = data.user;
    workshop = null;
    await afterLogin();
  } catch (e) {
    errEl.textContent = e.message;
  }
}
async function afterLogin() {
  try {
    const st = await api('/api/auth-status');
    user = st.user; workshop = st.workshop || null;
  } catch (_) { /* si falla, se sigue con lo que se tiene */ }
  document.getElementById('panelLink').style.display = (user && user.role === 'workshop') ? 'block' : 'none';
  document.getElementById('codigosLink').style.display = (user && user.isOwner) ? 'block' : 'none';
  document.getElementById('savedLine').textContent = user ? ('Hola, ' + user.name.split(' ')[0] + ' ✓') : '';
  await refreshBell();
  // Un taller en espera entra directo a su panel, donde ve el aviso de
  // la visita y el campo para meter su código cuando se lo entreguen.
  if (user && user.role === 'workshop' && user.approved === false) { openPanel(); return; }
  show('p-home');
}
function logout(silent) {
  localStorage.removeItem(TOKEN_KEY);
  user = null; workshop = null; profile = null;
  document.getElementById('codigosLink').style.display = 'none';
  if (!silent) toast('Sesión cerrada');
  setAuthMode('login');
  show('p-auth');
}

/* ---------- Campanita ---------- */
async function refreshBell() {
  const dot = document.getElementById('bellDot');
  if (!user) { dot.style.display = 'none'; return; }
  try {
    const d = await api('/api/notifications');
    dot.style.display = d.unread > 0 ? 'flex' : 'none';
    dot.textContent = d.unread > 9 ? '9+' : d.unread;
  } catch (_) { dot.style.display = 'none'; }
}
async function openNotifs() {
  try {
    const d = await api('/api/notifications');
    const list = document.getElementById('notifList');
    list.innerHTML = '';
    if (!d.notificaciones.length) {
      list.innerHTML = '<p class="calm">No tienes avisos todavía.</p>';
    }
    d.notificaciones.forEach(n => {
      const div = document.createElement('div');
      div.className = 'card'; div.style.cursor = 'default';
      div.innerHTML = '<h3>' + esc(n.titulo) + (n.leida ? '' : ' <span class="badge red">NUEVO</span>') + '</h3>' +
        '<div class="meta">' + esc(n.cuerpo || '') + '<br><span class="muted">' + new Date(n.createdAt).toLocaleString('es-MX') + '</span></div>';
      list.appendChild(div);
    });
    show('p-notifs');
    if (d.unread > 0) { await api('/api/notifications-read', { method: 'POST', body: {} }); refreshBell(); }
  } catch (e) { toast(e.message); }
}

/* ---------- Pantalla 1: botones de incidente ---------- */
const grid = document.getElementById('incidentGrid');
INCIDENTS.forEach(inc => {
  const b = document.createElement('button');
  b.className = 'big';
  b.innerHTML = esc(inc.label) + '<small>' + esc(inc.sub) + '</small>';
  b.onclick = () => pickIncident(inc);
  grid.appendChild(b);
});

// Recogida de la grúa: el enlace "Escribir la dirección a mano" se ata
// aquí (no con onclick en el HTML, que jsdom no ejecuta en las pruebas).
// El botón de ubicación es el de arriba ("Usar mi ubicación").
document.getElementById('btnOrigenManual').onclick = () => setOrigenGrua('manual');

function pickIncident(inc) {
  if (inc.k === 'foquito') { show('p-foquito'); return; }
  incident = inc;
  choqueModo = null;
  mecanicoModo = null;
  llanteraModo = null;
  gruaKm = null;
  gruaDestino = '';
  gruaOrigen = 'gps';
  gruaOrigenTxt = 'Mi ubicación actual';
  // Al chocar, al no arrancar y en llantera primero se pregunta CÓMO
  // quiere la ayuda.
  if (inc.k === 'choque') { show('p-choque-modo'); return; }
  if (inc.k === 'noarranca') { show('p-mecanico-modo'); return; }
  if (inc.k === 'llantera') { show('p-llantera-modo'); return; }
  irADatos(inc);
}

// Recogida de la grúa: UN SOLO botón de ubicación — el de arriba
// ("Usar mi ubicación"). Al picarlo, el cuadro se llena DIRECTO con tu
// dirección (reverse-geocode con Nominatim, gratis y sin llave). No hay
// un segundo botón de ubicación abajo: el de "Mi ubicación actual" se
// quitó porque era lo mismo dos veces. Si el carro no está donde estás
// tú, el enlace "Escribir la dirección a mano" abre el cuadro para
// escribirla; al buscar, esa dirección se geocodifica para los km.
// Con la llave de Google Places (pendiente) la opción manual además
// sugerirá direcciones mientras se escribe.
async function setOrigenGrua(modo) {
  gruaOrigen = modo;
  const input = document.getElementById('dRecogida');
  if (modo === 'manual') {
    input.disabled = false;
    input.value = '';
    input.placeholder = 'Ej. Av. Reforma 123, Ensenada';
    input.focus();
    return;
  }
  input.disabled = true;
  input.placeholder = 'Mi ubicación actual';
  gruaOrigenTxt = 'Mi ubicación actual';
  if (lat == null || lng == null) { input.value = 'Mi ubicación actual'; return; }
  input.value = 'Buscando tu dirección…';
  try {
    const r = await api('/api/reverse-geocode', { method: 'POST', body: { lat, lng } });
    input.value = r.direccion;
    gruaOrigenTxt = r.direccion;
  } catch (e) {
    input.value = 'Mi ubicación actual';
  }
}

function irADatos(inc) {
  // En los modos "yo conduzco el auto hasta el taller" NO se pide la
  // ubicación del conductor: él lleva el carro, así que el botón de
  // ubicación se esconde y la búsqueda va sin coordenadas.
  const conduzco = esConduzco();
  document.getElementById('locBox').style.display = conduzco ? 'none' : 'block';
  document.getElementById('datosTitle').textContent = conduzco ? 'Tú llevas el carro al taller' : inc.label.replace(/^[^\s]+\s/, '') + ' — ¿Dónde estás?';
  document.getElementById('datosNote').textContent = conduzco ? 'Te mostramos los talleres disponibles; tú eliges a cuál llevar tu carro.' : inc.datosNote;
  document.getElementById('buscarBtn').textContent = inc.buscar;
  document.getElementById('otroBox').style.display = (inc.k === 'otro') ? 'block' : 'none';
  // La grúa pide los dos lugares: dónde se recoge el vehículo y adónde
  // se lleva. La recogida es tu ubicación actual por defecto.
  document.getElementById('gruaBox').style.display = (inc.k === 'grua') ? 'block' : 'none';
  if (inc.k === 'grua') {
    gruaKm = null; gruaDestino = '';
    document.getElementById('dDestino').value = '';
    document.getElementById('gruaDistancia').textContent = '';
    setOrigenGrua('gps');
  }
  // Servicio a domicilio (presupuesto o asistencia en casa): se pide el
  // domicilio, porque la persona puede no estar en su casa cuando lo
  // pide — igual que la recogida de la grúa, se puede escribir a mano.
  document.getElementById('domicilioBox').style.display = esDomicilio() ? 'block' : 'none';
  if (esDomicilio()) {
    domicilioLat = null; domicilioLng = null;
    setOrigenDomicilio('gps');
  }
  renderCarroPicker();
  show('p-datos');
}

// ¿El modo elegido es un servicio a domicilio? (choque, mecánico o
// llantera a domicilio). Solo en esos casos se pide el domicilio.
function esDomicilio() {
  return (incident && incident.k === 'choque' && choqueModo && choqueModo.k === 'domicilio')
    || (incident && incident.k === 'noarranca' && mecanicoModo && mecanicoModo.k === 'domicilio')
    || (incident && incident.k === 'llantera' && llanteraModo && llanteraModo.k === 'domicilio');
}

// ¿El modo elegido es "yo conduzco el auto hasta el taller"? (choque
// o mecánico). En esos casos NO se pide la ubicación del conductor:
// él lleva el carro, así que la búsqueda va sin coordenadas. La
// llantera "más cercana" NO es conduzco: ahí sí se ocupa la ubicación
// para saber cuál queda más cerca.
function esConduzco() {
  return (incident && incident.k === 'choque' && choqueModo && choqueModo.k === 'conduzco')
    || (incident && incident.k === 'noarranca' && mecanicoModo && mecanicoModo.k === 'conduzco');
}

// Domicilio del servicio: igual que la recogida de la grúa. Por
// defecto es tu ubicación actual (se llena sola con tu dirección);
// con "Escribir la dirección a mano" se escribe el domicilio donde
// quieres el servicio cuando no estás en tu casa.
async function setOrigenDomicilio(modo) {
  domicilioOrigen = modo;
  const input = document.getElementById('dDomicilio');
  if (modo === 'manual') {
    input.disabled = false;
    input.value = '';
    input.placeholder = 'Ej. Av. Reforma 123, Ensenada';
    input.focus();
    return;
  }
  input.disabled = true;
  input.placeholder = 'Mi ubicación actual';
  domicilioTxt = 'Mi ubicación actual';
  if (lat == null || lng == null) { input.value = 'Mi ubicación actual'; return; }
  input.value = 'Buscando tu dirección…';
  try {
    const r = await api('/api/reverse-geocode', { method: 'POST', body: { lat, lng } });
    input.value = r.direccion;
    domicilioTxt = r.direccion;
  } catch (e) {
    input.value = 'Mi ubicación actual';
  }
}

// Domicilio que se manda al taller: lo que está en el cuadro (la
// dirección escrita a mano o la que se llenó con tu ubicación).
function domicilioTexto() {
  const box = document.getElementById('domicilioBox');
  if (box && box.style.display !== 'none') {
    const v = document.getElementById('dDomicilio').value.trim();
    if (v) return v;
  }
  return domicilioTxt;
}

// Domicilio: el enlace "Escribir la dirección a mano" se ata aquí
// (no con onclick en el HTML, que jsdom no ejecuta en las pruebas).
document.getElementById('btnDomicilioManual').onclick = () => setOrigenDomicilio('manual');

function pickChoqueModo(modo) {
  choqueModo = modo;
  irADatos(incident);
}

/* ---------- Modos de ayuda al chocar ---------- */
const CHOQUE_MODOS = [
  { k: 'lugar', label: '📍 Necesito asistencia/presupuesto en el lugar del percance', tag: 'URGENTE' },
  { k: 'conduzco', label: '🚗 Necesito un presupuesto (yo conduzco el auto hasta el taller)', tag: null },
  { k: 'domicilio', label: '🏠 Necesito un presupuesto a domicilio', tag: null },
];
const modosGrid = document.getElementById('choqueModos');
CHOQUE_MODOS.forEach(m => {
  const b = document.createElement('button');
  b.className = 'big';
  b.innerHTML = esc(m.label) + (m.tag ? ' <span class="badge red">' + esc(m.tag) + '</span>' : '');
  b.onclick = () => pickChoqueModo(m);
  modosGrid.appendChild(b);
});

function pickMecanicoModo(modo) {
  mecanicoModo = modo;
  irADatos(incident);
}

/* ---------- Modos de ayuda al no arrancar ---------- */
const MECANICO_MODOS = [
  { k: 'lugar', label: '📍 Necesito un mecánico en mi ubicación actual', tag: 'URGENTE' },
  { k: 'domicilio', label: '🏠 Asistencia mecánica a domicilio', tag: null },
  { k: 'conduzco', label: '🚗 Puedo manejar el carro hasta el taller', tag: null },
];
const mecanicoGrid = document.getElementById('mecanicoModos');
MECANICO_MODOS.forEach(m => {
  const b = document.createElement('button');
  b.className = 'big';
  b.innerHTML = esc(m.label) + (m.tag ? ' <span class="badge red">' + esc(m.tag) + '</span>' : '');
  b.onclick = () => pickMecanicoModo(m);
  mecanicoGrid.appendChild(b);
});

function pickLlanteraModo(modo) {
  llanteraModo = modo;
  irADatos(incident);
}

/* ---------- Modos de ayuda de llantera ---------- */
const LLANTERA_MODOS = [
  { k: 'domicilio', label: '🏠 Llantera a domicilio', tag: null },
  { k: 'cercana', label: '📍 Necesito la llantera más cercana', tag: null },
];
const llanteraGrid = document.getElementById('llanteraModos');
LLANTERA_MODOS.forEach(m => {
  const b = document.createElement('button');
  b.className = 'big';
  b.innerHTML = esc(m.label) + (m.tag ? ' <span class="badge red">' + esc(m.tag) + '</span>' : '');
  b.onclick = () => pickLlanteraModo(m);
  llanteraGrid.appendChild(b);
});

/* ---------- Carros guardados (hasta 3) ---------- */
function getCarros() {
  return (profile && profile.carros) || [];
}
function renderCarroPicker() {
  const picker = document.getElementById('carroPicker');
  const manual = document.getElementById('carroManual');
  const carros = getCarros();
  picker.innerHTML = '';
  carroElegido = null;
  if (!carros.length) { manual.style.display = 'block'; return; }
  manual.style.display = 'none';
  carros.forEach(c => {
    const b = document.createElement('button');
    b.className = 'big';
    b.innerHTML = '🚗 ' + esc(carroLabel(c)) + '<small>Pica este carro</small>';
    b.onclick = () => {
      picker.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      carroElegido = c;
      manual.style.display = 'none';
    };
    picker.appendChild(b);
  });
  const otro = document.createElement('button');
  otro.className = 'big';
  otro.innerHTML = '✏️ Otro carro<small>Escribir marca y modelo</small>';
  otro.onclick = () => {
    picker.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
    otro.classList.add('sel');
    carroElegido = null;
    manual.style.display = 'block';
  };
  picker.appendChild(otro);
  picker.querySelector('button').classList.add('sel');
  carroElegido = carros[0];
}
function addCarro() {
  if (carrosVisibles < 3) {
    carrosVisibles++;
    document.getElementById('carro' + carrosVisibles).style.display = 'block';
    if (carrosVisibles === 3) document.getElementById('addCarroBtn').style.display = 'none';
  }
}

/* ---------- Perfil del conductor ---------- */
function toggleSeguro() {
  document.getElementById('seguroFields').style.display =
    document.getElementById('uTieneSeguro').checked ? 'block' : 'none';
}
async function openDriverProfile() {
  try {
    const d = await api('/api/driver-profile');
    profile = d.profile;
    fillDriverForm(profile);
  } catch (e) { toast(e.message); return; }
  show('p-registro');
}
function fillDriverForm(p) {
  document.getElementById('uNombre').value = user ? user.name : '';
  document.getElementById('uTel').value = user ? (user.phone || '') : '';
  const carros = p.carros || [];
  carrosVisibles = 1;
  document.getElementById('carro2').style.display = 'none';
  document.getElementById('carro3').style.display = 'none';
  document.getElementById('addCarroBtn').style.display = 'block';
  for (let i = 0; i < 3; i++) {
    const n = i + 1, c = carros[i] || {};
    document.getElementById('uMarca' + n).value = c.marca || '';
    document.getElementById('uModelo' + n).value = c.modelo || '';
    document.getElementById('uAnio' + n).value = c.anio || '';
    document.getElementById('uColor' + n).value = c.color || '';
    if (i > 0 && c.marca) {
      carrosVisibles = n;
      document.getElementById('carro' + n).style.display = 'block';
    }
  }
  if (carrosVisibles === 3) document.getElementById('addCarroBtn').style.display = 'none';
  document.getElementById('uTieneSeguro').checked = !!p.tieneSeguro;
  document.getElementById('uAseguradora').value = p.aseguradora || '';
  document.getElementById('uPoliza').value = p.poliza || '';
  document.getElementById('uTelAseg').value = p.telAseg || '';
  toggleSeguro();
}
async function saveUser() {
  const carros = [];
  [1, 2, 3].forEach(n => {
    const marca = document.getElementById('uMarca' + n).value.trim();
    if (!marca) return;
    carros.push({
      marca,
      modelo: document.getElementById('uModelo' + n).value.trim(),
      anio: document.getElementById('uAnio' + n).value.trim(),
      color: document.getElementById('uColor' + n).value.trim(),
    });
  });
  try {
    const d = await api('/api/driver-profile-save', {
      method: 'POST',
      body: {
        carros,
        tieneSeguro: document.getElementById('uTieneSeguro').checked,
        aseguradora: document.getElementById('uAseguradora').value,
        poliza: document.getElementById('uPoliza').value.trim(),
        telAseg: document.getElementById('uTelAseg').value.trim(),
      },
    });
    profile = d.profile;
    toast('Datos guardados ✓');
    show('p-home');
  } catch (e) { toast(e.message); }
}

/* ---------- Pantalla 2: ubicación y foto ---------- */
function useLocation() {
  if (!navigator.geolocation) {
    document.getElementById('locLine').textContent = 'Tu teléfono no permite ubicación. Buscamos con la zona de Ensenada.';
    return;
  }
  document.getElementById('locLine').textContent = 'Buscando tu ubicación…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      lat = pos.coords.latitude; lng = pos.coords.longitude;
      document.getElementById('locLine').textContent = '📍 Ubicación lista ✓';
      toast('Ubicación lista ✓');
      ponerMarcadorYo();
      // Si está en la pantalla de la grúa, el botón SIEMPRE vuelve a
      // poner tu ubicación actual en el cuadro — aunque antes lo
      // hubieras borrado o cambiado a escribir a mano. Antes solo se
      // llenaba si el modo seguía en 'gps', así que borrarlo y volver
      // a picar el botón ya no lo ponía (reporte de Orlan 2026-11-20).
      if (incident && incident.k === 'grua') setOrigenGrua('gps');
      // Igual para el domicilio: si el servicio es a domicilio, el
      // botón vuelve a poner tu ubicación en el cuadro del domicilio.
      if (esDomicilio()) setOrigenDomicilio('gps');
      // Mostrar la dirección escrita abajo del botón para que el
      // conductor se asegure de que sí se leyó su ubicación (pide
      // Orlan 2026-11-20). La pantalla de datos es la misma para
      // todos los incidentes, así que sale en todas.
      mostrarDireccionActual();
      // Seguir tu punto en vivo mientras la app está abierta: si te
      // mueves, el punto azul del mapa se mueve contigo.
      if (watchId == null && navigator.geolocation.watchPosition) {
        watchId = navigator.geolocation.watchPosition(
          p => { lat = p.coords.latitude; lng = p.coords.longitude; ponerMarcadorYo(); },
          () => {},
          { timeout: 10000, maximumAge: 10000 }
        );
      }
    },
    () => {
      document.getElementById('locLine').textContent = 'No pudimos tomar tu ubicación. Buscamos con la zona de Ensenada.';
    },
    { timeout: 8000 }
  );
}
function mostrarDireccionActual() {
  const line = document.getElementById('locLine');
  if (!line || lat == null || lng == null) return;
  api('/api/reverse-geocode', { method: 'POST', body: { lat, lng } })
    .then(r => {
      line.innerHTML = '📍 Ubicación lista ✓<br><b style="color:#e8eef4">' + esc(r.direccion) + '</b>';
    })
    .catch(() => {
      // Sin dirección escrita (sin internet), queda el "Ubicación lista ✓".
    });
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
document.getElementById('fotoInput').addEventListener('change', async function () {
  if (this.files && this.files.length) {
    const f = this.files[0];
    if (f.size > 2 * 1024 * 1024) { toast('La foto es muy pesada (máximo 2 MB).'); this.value = ''; return; }
    fotoDataUrl = await readFileAsDataUrl(f);
    document.getElementById('fotoLine').textContent = '📷 Foto agregada: ' + f.name;
  }
});

function carroManual() {
  const marca = document.getElementById('dMarca').value.trim();
  const modelo = document.getElementById('dModelo').value.trim();
  if (!marca && !modelo) return null;
  return {
    marca, modelo,
    anio: document.getElementById('dAnio').value.trim(),
    color: document.getElementById('dColor').value.trim(),
  };
}

/* ---------- Mapa en vivo (resultados) ---------- */
// Tu punto azul en el mapa. Si el mapa aún no existe (estás en otra
// pantalla), no hace nada: se pinta cuando se abre el mapa.
function ponerMarcadorYo() {
  if (!mapa || lat == null || lng == null || typeof L === 'undefined') return;
  if (marcadorYo) { marcadorYo.setLatLng([lat, lng]); return; }
  const yo = L.divIcon({ className: '', html: '<div class="pin-yo"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
  marcadorYo = L.marker([lat, lng], { icon: yo }).addTo(mapa);
  marcadorYo.bindPopup('📍 Tú estás aquí');
}
function initMapa() {
  const nota = document.getElementById('mapaNota');
  // Sin Leaflet (sin internet para el CDN) la lista de abajo sigue
  // funcionando igual: el mapa es un extra, no un requisito.
  if (typeof L === 'undefined') {
    nota.textContent = 'El mapa no cargó (revisa tu conexión). La lista de talleres está abajo.';
    return;
  }
  if (mapa) { mapa.remove(); mapa = null; marcadorYo = null; }
  const tengoUbicacion = lat != null && lng != null;
  const centro = tengoUbicacion ? [lat, lng] : ENSENADA;
  mapa = L.map('mapaResultados', { zoomControl: true }).setView(centro, 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  }).addTo(mapa);
  if (tengoUbicacion) ponerMarcadorYo();
  // Pines dorados: solo los talleres que tienen su ubicación guardada.
  // Los que no la tienen no inventan un pin: salen solo en la lista.
  const conCoord = results.filter(s => s.lat != null && s.lng != null);
  conCoord.forEach(s => {
    const i = results.indexOf(s);
    const pin = L.divIcon({ className: '', html: '<div class="pin-taller"></div>', iconSize: [30, 42], iconAnchor: [15, 42], popupAnchor: [0, -40] });
    const m = L.marker([Number(s.lat), Number(s.lng)], { icon: pin }).addTo(mapa);
    m.bindPopup('<b>' + esc(s.nombre) + '</b><br>' + esc(s.esp) + '<br>' + Number(s.distKm).toFixed(1) + ' km' +
      '<br><button class="mini-btn" onclick="openShop(' + i + ')">Ver taller</button>');
  });
  if (!tengoUbicacion) {
    nota.textContent = 'Mapa centrado en Ensenada. Pica “Usar mi ubicación” en la pantalla anterior para verte en el mapa.';
  } else if (!conCoord.length) {
    nota.textContent = 'Estos talleres no tienen su ubicación guardada todavía, por eso no salen pines en el mapa.';
  } else {
    nota.textContent = '';
    // Que se vean tu punto y todos los pines a la vez.
    const pts = [[lat, lng]].concat(conCoord.map(s => [Number(s.lat), Number(s.lng)]));
    mapa.fitBounds(pts, { padding: [24, 24] });
  }
  // El mapa se armó justo al mostrar la pantalla: recalcular su tamaño.
  setTimeout(() => { if (mapa) mapa.invalidateSize(); }, 60);
}

/* ---------- Pantalla 3: resultados ---------- */
async function searchShops() {
  if (!incident) incident = INCIDENTS.find(i => i.k === 'otro');
  // Grúa: sin destino no hay traslado que calcular; y los km se
  // calculan ANTES de buscar, para que salgan en los resultados.
  // El origen es el GPS o, si se escribió la dirección a mano, esa
  // dirección (se geocodifica en el mismo llamado).
  if (incident.k === 'grua') {
    const destino = document.getElementById('dDestino').value.trim();
    if (!destino) { toast('Escribe adónde se lleva el vehículo.'); return; }
    gruaDestino = destino;
    gruaKm = null;
    const body = { destino };
    if (gruaOrigen === 'manual') {
      const dir = document.getElementById('dRecogida').value.trim();
      if (!dir) { toast('Escribe la dirección donde se recoge el vehículo.'); return; }
      body.origenDireccion = dir;
    } else if (lat != null && lng != null) {
      body.origenLat = lat; body.origenLng = lng;
    }
    if (body.origenDireccion || body.origenLat != null) {
      try {
        const d = await api('/api/grua-distancia', { method: 'POST', body });
        gruaKm = d.km;
        document.getElementById('gruaDistancia').textContent = 'Distancia del traslado: ' + Number(d.km).toFixed(1) + ' km';
      } catch (e) {
        document.getElementById('gruaDistancia').textContent = 'No se pudo calcular la distancia: ' + e.message;
      }
    } else {
      document.getElementById('gruaDistancia').textContent = 'Activa tu ubicación para calcular los km del traslado.';
    }
  }
  const q = new URLSearchParams({ incident: incident.k });
  if (incident.k === 'foquito' && incident.tipo) q.set('tipo', incident.tipo);
  // A domicilio, los talleres se buscan cerca DEL DOMICILIO, no de
  // donde estás tú (puedes pedirlo desde el trabajo o la calle). Si
  // el domicilio se escribió a mano, se geocodifica para buscar con
  // sus coordenadas; si es tu ubicación actual, son tus coordenadas.
  let qLat = lat, qLng = lng;
  if (esDomicilio()) {
    if (domicilioOrigen === 'manual') {
      const dir = document.getElementById('dDomicilio').value.trim();
      if (!dir) { toast('Escribe el domicilio donde es el servicio.'); return; }
      try {
        const g = await api('/api/geocode', { method: 'POST', body: { direccion: dir } });
        qLat = g.lat; qLng = g.lng;
        domicilioLat = g.lat; domicilioLng = g.lng;
        domicilioTxt = g.direccion;
      } catch (e) { toast(e.message); return; }
    } else {
      domicilioLat = lat; domicilioLng = lng;
    }
  }
  if (qLat != null && qLng != null) { q.set('lat', qLat); q.set('lng', qLng); }
  try {
    const d = await api('/api/search?' + q.toString());
    results = d.shops;
    // Sin llave de Google Places (o si Google falló), solo salieron los
    // talleres con la app: se avisa con una línea corta.
    document.getElementById('googleNote').style.display = d.googleDisponible === false ? 'block' : 'none';
    document.getElementById('resTitle').textContent = d.resTitle;
    let desc = '';
    if (incident.k === 'otro') {
      const v = document.getElementById('otroDesc').value.trim();
      if (v) desc = 'Tu problema: “' + v + '” · ';
    }
    const carro = carroElegido || carroManual();
    const carroTxt = carro ? ' · ' + carroLabel(carro) : '';
    const modoTxt = (incident.k === 'choque' && choqueModo) ? ' · ' + choqueModo.label.replace(/^[^\s]+\s/, '')
      : (incident.k === 'noarranca' && mecanicoModo) ? ' · ' + mecanicoModo.label.replace(/^[^\s]+\s/, '')
      : (incident.k === 'llantera' && llanteraModo) ? ' · ' + llanteraModo.label.replace(/^[^\s]+\s/, '') : '';
    const gruaTxt = (incident.k === 'grua' && gruaKm != null) ? ' · Traslado: ' + gruaKm.toFixed(1) + ' km' : '';
    document.getElementById('resSub').textContent = desc + 'Para: ' + incident.label.replace(/^[^\s]+\s/, '') + carroTxt + modoTxt + gruaTxt + ' · Ensenada.';
    document.getElementById('resHint').textContent = (incident.k === 'otro')
      ? '¿No te convence ninguno? Vuelve atrás y ajusta tu descripción.'
      : '¿No te convence ninguno? Pica “Otro problema” en el inicio y descríbelo.';
    const list = document.getElementById('resList');
    list.innerHTML = '';
    if (!results.length) {
      list.innerHTML = '<p class="calm">No encontramos talleres para eso por aquí. Prueba con “Otro problema” y descríbelo.</p>';
    }
    results.forEach((s, i) => {
      const div = document.createElement('div');
      div.className = 'card';
      // Presupuesto o asistencia fuera del taller (en el lugar del
      // percance, a domicilio, o donde se quedó el carro): el taller
      // pone su precio; cubre servicio, tiempo y traslado. Si el
      // cliente lleva el carro, no hay costo extra.
      const fueraTaller = (incident.k === 'choque' && choqueModo && choqueModo.k !== 'conduzco')
        || (incident.k === 'noarranca' && mecanicoModo && mecanicoModo.k !== 'conduzco')
        || (incident.k === 'llantera' && llanteraModo && llanteraModo.k === 'domicilio');
      const visita = (fueraTaller && s.enApp)
        ? '<br>' + (incident.k === 'choque' ? 'Presupuesto' : 'Asistencia') + ' fuera del taller: <b>' + (s.costoVisita != null ? '$' + Number(s.costoVisita).toLocaleString('es-MX') + ' MXN' : 'a convenir') + '</b> <span class="muted">(servicio, tiempo y traslado)</span>'
        : '';
      div.innerHTML =
        '<h3>' + esc(s.nombre) + (s.enApp ? '<span class="badge prem">✓ En la app</span>' : '<span class="badge">De Google</span>') +
        (s.plan === 'Premium' ? '<span class="badge prem">★ PREMIUM</span>' : (s.plan === 'Destacado' ? '<span class="badge">DESTACADO</span>' : '')) + '</h3>' +
        '<div class="esp">' + esc(s.esp) + '</div>' +
        '<div class="meta"><span class="stars">' + stars(s.rating) + '</span> ' + s.rating + ' (' + s.opiniones + ' opiniones)<br>' +
        '📍 ' + s.distKm.toFixed(1) + ' km · ' + esc(s.zona) + '<br>' +
        '<span class="open">● Abierto ahora</span> · ' + esc(s.horario) + visita + '</div>' +
        '<div class="actions">' +
          '<a class="call" href="tel:' + esc(s.tel) + '" onclick="trackLlamada(' + qid(s.id) + ', \'' + s.source + '\')">📞 Llamar</a>' +
          '<a class="wa" href="https://wa.me/52' + esc(s.tel.replace(/\D/g, '')) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' +
        '</div>' +
        (s.enApp
          ? '<button class="primary" style="margin-top:10px;" onclick="event.stopPropagation(); notifyShop(' + i + ')">Avisar al taller</button>'
          : '<p class="muted" style="margin-top:10px;">Este taller aún no tiene la app: te comunicas por teléfono o WhatsApp.</p>');
      div.onclick = () => openShop(i);
      list.appendChild(div);
    });
    show('p-resultados');
    initMapa();
  } catch (e) { toast(e.message); }
}
async function trackLlamada(shopId, source) {
  if (source !== 'app') return;
  try { await api('/api/track-event', { method: 'POST', body: { workshopId: shopId, kind: 'llamada' } }); } catch (_) {}
}

/* ---------- Pantalla 4: ficha del taller ---------- */
async function openShop(i) {
  const s = results[i];
  currentShop = s;
  try { if (s.source === 'app') await api('/api/track-event', { method: 'POST', body: { workshopId: s.id, kind: 'vista' } }); } catch (_) {}
  try {
    // Los talleres de Google ya vienen completos en los resultados: la
    // ficha se pinta con esos datos, sin otra llamada. (El detalle por
    // Place Details, /api/shop-get?source=google&id=places:..., queda
    // para cuando no hay resultado guardado.)
    const d = s.source === 'google'
      ? { shop: s, servicios: [], reviews: [] }
      : await api('/api/shop-get?source=' + s.source + '&id=' + encodeURIComponent(s.id));
    const sh = d.shop;
    let html =
      '<h2>' + esc(sh.nombre) + (sh.enApp ? ' <span class="badge prem">✓ En la app</span>' : ' <span class="badge">De Google</span>') + '</h2>' +
      '<div class="esp" style="color:#7fb3e8; font-size:16px; margin-bottom:10px;">' + esc(sh.esp) + '</div>' +
      '<div class="meta"><span class="stars">' + stars(sh.rating) + '</span> ' + sh.rating + ' (' + sh.opiniones + ' opiniones)<br>' +
      '📍 ' + sh.distKm.toFixed(1) + ' km · ' + esc(sh.dir) + '<br>' +
      '<span class="open">● Abierto ahora</span> · ' + esc(sh.horario) + '<br>' +
      (sh.servicios ? '🛠 ' + esc(sh.servicios) : '') +
      ((incident && incident.k === 'choque' && choqueModo && choqueModo.k !== 'conduzco' && sh.enApp)
        ? '<br>Presupuesto fuera del taller: <b>' + (sh.costoVisita != null ? '$' + Number(sh.costoVisita).toLocaleString('es-MX') + ' MXN' : 'a convenir') + '</b> <span class="muted">(servicio, tiempo y traslado)</span>' : '') + '</div>';
    if (sh.ofertas && sh.ofertas.length) {
      html += '<h2 style="margin-top:22px;">Ofertas</h2>';
      sh.ofertas.forEach(o => {
        html += '<div class="card" style="cursor:default;"><h3>' + esc(o.titulo) + '</h3><div class="meta"><b>' + esc(o.precio) + '</b> · ' + esc(o.vigencia) + '</div></div>';
      });
    }
    if (d.servicios && d.servicios.length) {
      html += '<h2 style="margin-top:22px;">Servicios y precios</h2>';
      d.servicios.forEach(sv => {
        html += '<div class="review"><b>' + esc(sv.nombre) + '</b><br>' + esc(sv.precio) + '</div>';
      });
    }
    html += '<div class="actions">' +
      '<a class="call" href="tel:' + esc(sh.tel) + '" onclick="trackLlamada(' + qid(sh.id) + ', \'' + sh.source + '\')">📞 Llamar</a>' +
      '<a class="wa" href="https://wa.me/52' + esc(sh.tel.replace(/\D/g, '')) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' +
      '</div>' +
      (sh.enApp
        ? '<button class="primary" onclick="notifyShop(null)">Avisar al taller</button>'
        : '<p class="muted" style="margin-top:14px;">Este taller aún no tiene la app: te comunicas por teléfono o WhatsApp.</p>');
    if (d.reviews && d.reviews.length) {
      html += '<h2 style="margin-top:22px;">Opiniones</h2>';
      d.reviews.forEach(r => {
        html += '<div class="review"><b>' + esc(r[0]) + '</b> <span class="stars">★★★★★</span><br>' + esc(r[1]) + '</div>';
      });
    }
    document.getElementById('fichaBody').innerHTML = html;
    show('p-ficha');
  } catch (e) { toast(e.message); }
}

/* ---------- Pantalla 8: foquito del tablero ---------- */
async function loadFocos() {
  try {
    const d = await api('/api/focos');
    FOCOS = d.focos;
  } catch (_) { FOCOS = []; }
}
function mostrarFocos() {
  document.getElementById('focosBox').style.display = 'block';
  document.getElementById('focoResultado').style.display = 'none';
  const list = document.getElementById('focosList');
  if (!list.children.length) {
    FOCOS.forEach(f => {
      const row = document.createElement('label');
      row.className = 'check-row';
      row.style.cssText = 'background:#16283f; border:1px solid #243850; border-radius:12px; padding:12px; margin-bottom:8px; cursor:pointer;';
      row.innerHTML = '<input type="checkbox" data-foco="' + f.id + '"><span>' + f.icono + ' ' + esc(f.nombre) + '</span>';
      row.querySelector('input').onchange = function () { focosSel[f.id] = this.checked; };
      list.appendChild(row);
    });
  }
}
document.getElementById('fotoTableroInput').addEventListener('change', async function () {
  if (this.files && this.files.length) {
    const f = this.files[0];
    if (f.size > 2 * 1024 * 1024) { toast('La foto es muy pesada (máximo 2 MB).'); this.value = ''; return; }
    const url = await readFileAsDataUrl(f);
    document.getElementById('fotoTableroImg').src = url;
    document.getElementById('fotoTableroPreview').style.display = 'block';
    fotoDataUrl = url;
    mostrarFocos();
    await leerFotoTablero(url);
  }
});
// Manda la foto del tablero a la IA y marca solos los foquitos que se
// ven prendidos. La foto no se guarda. Si la lectura no está activada
// (sin llave) o falla, queda la lista manual de siempre y el conductor
// pica los foquitos a mano.
async function leerFotoTablero(dataUrl) {
  const line = document.getElementById('fotoIALine');
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) return;
  line.textContent = 'Leyendo la foto con inteligencia artificial…';
  line.style.display = 'block';
  try {
    const d = await api('/api/focos-leer-foto', { method: 'POST', body: { dataBase64: m[2], mimeType: m[1] } });
    if (!d.ok) {
      line.textContent = d.reason === 'no-key'
        ? 'La lectura automática no está activada todavía. Pica los foquitos que ves prendidos.'
        : 'No se pudo leer la foto sola. Pica los foquitos que ves prendidos.';
      return;
    }
    if (!d.focos.length) {
      line.textContent = 'No se ve ningún foquito prendido con claridad en la foto. Si ves alguno, pícalo.';
      return;
    }
    // Nueva foto, nueva lectura: se limpia lo marcado antes.
    focosSel = {};
    document.querySelectorAll('#focosList input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    d.focos.forEach(id => { focosSel[id] = true; });
    document.querySelectorAll('#focosList input[type="checkbox"]').forEach(cb => { cb.checked = !!focosSel[cb.dataset.foco]; });
    line.textContent = 'La inteligencia artificial marcó los foquitos que ve prendidos. Revisa y corrige si hace falta.';
  } catch (e) {
    line.textContent = 'No se pudo leer la foto sola. Pica los foquitos que ves prendidos.';
  }
}
async function mostrarSignificados() {
  const ids = Object.keys(focosSel).filter(k => focosSel[k]);
  const box = document.getElementById('focoResultado');
  if (!ids.length) {
    box.innerHTML = '<p class="calm">Pica primero los foquitos que ves prendidos.</p>';
    box.style.display = 'block';
    return;
  }
  try {
    const d = await api('/api/focos-diagnostico', { method: 'POST', body: { focos: ids } });
    let html = '<h2>Qué significa cada foquito</h2>';
    d.focos.forEach(f => {
      html += '<div class="card" style="cursor:default;"><h3>' + f.icono + ' ' + esc(f.nombre) + '</h3>' +
        '<div class="meta">' + esc(f.significa) + '<br>' +
        '<b style="color:' + (f.urgencia === '¡No sigas manejando!' ? '#ff6b6b' : '#ffd75e') + ';">' + esc(f.urgencia) + '</b>' +
        (f.espLabel ? '<br>Te recomendamos: un taller <b>' + esc(f.espLabel) + '</b>.' : '') + '</div></div>';
    });
    d.especialistas.forEach(e => {
      html += '<button class="primary" onclick="buscarEspecialista(\'' + e.tipo + '\')">Buscar taller ' + esc(e.label) + ' ahora</button>';
    });
    box.innerHTML = html;
    box.style.display = 'block';
  } catch (e) { toast(e.message); }
}
function buscarEspecialista(tipo) {
  incident = { k: 'foquito', label: '💡 Foquito del tablero', tipo, buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller más cercano.' };
  document.getElementById('datosTitle').textContent = 'Foquito del tablero — ¿Dónde estás?';
  document.getElementById('datosNote').textContent = incident.datosNote;
  document.getElementById('buscarBtn').textContent = tipo === 'electrico' ? 'Buscar taller eléctrico' : 'Buscar taller ahora';
  document.getElementById('otroBox').style.display = 'none';
  renderCarroPicker();
  show('p-datos');
}

/* ---------- Pantalla 7: avisar al taller ---------- */
async function notifyShop(i) {
  const s = (i === null || i === undefined) ? currentShop : results[i];
  if (!s || !s.enApp) { toast('Ese taller aún no tiene la app.'); return; }
  if (!user) { toast('Inicia sesión para avisarle al taller.'); show('p-auth'); return; }
  const carro = carroElegido || carroManual();
  let descripcion = '';
  if (incident && incident.k === 'otro') descripcion = document.getElementById('otroDesc').value.trim();
  else if (incident && incident.k === 'choque' && choqueModo) {
    // El modo lleva un emoji al inicio (como los botones); se quita para
    // el texto que ve el taller y el que sale en resultados.
    const modoLabel = choqueModo.label.replace(/^[^\s]+\s/, '');
    descripcion = (choqueModo.tag ? choqueModo.tag + ': ' : '') + modoLabel;
    // Si el taller va al cliente (lugar del percance o domicilio), el
    // aviso lleva el costo por la visita que el taller puso en su panel.
    if (choqueModo.k !== 'conduzco') descripcion += (s.costoVisita != null ? ' (costo por la visita: $' + Number(s.costoVisita).toLocaleString('es-MX') + ' MXN)' : ' (costo por la visita a convenir)');
  }
  else if (incident && incident.k === 'noarranca' && mecanicoModo) {
    // Igual que Choqué: se quita el emoji inicial del texto del taller.
    // La asistencia fuera del taller (donde se quedó el carro o a
    // domicilio) SÍ lleva el costo por la visita que el taller puso en
    // su panel, igual que los presupuestos del carrocero.
    const modoLabel = mecanicoModo.label.replace(/^[^\s]+\s/, '');
    descripcion = (mecanicoModo.tag ? mecanicoModo.tag + ': ' : '') + modoLabel;
    if (mecanicoModo.k !== 'conduzco') descripcion += (s.costoVisita != null ? ' (costo por la visita: $' + Number(s.costoVisita).toLocaleString('es-MX') + ' MXN)' : ' (costo por la visita a convenir)');
  }
  else if (incident && incident.k === 'llantera' && llanteraModo) {
    // Igual que los demás: se quita el emoji inicial del texto del taller.
    // La llantera a domicilio SÍ lleva costo por la visita (decisión de
    // Orlan 2026-11-20 ~00:40), igual que el mecánico y el carrocero.
    const modoLabel = llanteraModo.label.replace(/^[^\s]+\s/, '');
    descripcion = (llanteraModo.tag ? llanteraModo.tag + ': ' : '') + modoLabel;
    if (llanteraModo.k === 'domicilio') descripcion += (s.costoVisita != null ? ' (costo por la visita: $' + Number(s.costoVisita).toLocaleString('es-MX') + ' MXN)' : ' (costo por la visita a convenir)');
  }
  else if (incident && incident.k === 'grua') {
    // La grúa lleva los dos lugares y los km del traslado, si se
    // pudieron calcular. La recogida es el texto que escribió el
    // conductor (por defecto "Mi ubicación actual").
    const recogida = document.getElementById('dRecogida').value.trim();
    descripcion = 'Necesito grúa';
    if (recogida) descripcion += ' · Recoger en: ' + recogida;
    if (gruaDestino) descripcion += ' · Llevar a: ' + gruaDestino;
    if (gruaKm != null) descripcion += ' (' + gruaKm.toFixed(1) + ' km)';
  }
  // A domicilio, el taller necesita saber DÓNDE es el servicio: el
  // domicilio va en el aviso (si la persona no está en su casa, es la
  // dirección que escribió a mano).
  if (esDomicilio()) descripcion += ' · Domicilio: ' + domicilioTexto();
  try {
    const d = await api('/api/notify', {
      method: 'POST',
      body: {
        workshopId: s.id, incident: incident ? incident.k : 'otro',
        descripcion, carro,
        // A domicilio, las coordenadas son las del domicilio (no las
        // de donde está la persona), para que el taller vea adónde va.
        lat: (esDomicilio() && domicilioLat != null) ? domicilioLat : lat,
        lng: (esDomicilio() && domicilioLng != null) ? domicilioLng : lng,
        fotoBase64: fotoDataUrl || undefined, fotoMime: undefined,
      },
    });
    const cTxt = carro ? ' para tu ' + carroLabel(carro) : '';
    document.getElementById('confirmText').textContent =
      'Avisamos a ' + s.nombre + ' (' + s.esp.toLowerCase() + ', a ' + s.distKm.toFixed(1) + ' km)' + cTxt + '.';
    document.getElementById('confirmWa').innerHTML =
      '<a class="wa" style="display:flex; min-height:54px; border-radius:12px; align-items:center; justify-content:center; font-size:17px; font-weight:700; text-decoration:none;" href="' + d.whatsappUrl + '" target="_blank" rel="noopener">💬 Abrir WhatsApp con el taller</a>' +
      '<p class="muted center" style="margin-top:8px;">El mensaje ya lleva escrito qué te pasó y cuál es tu carro.</p>';
    const card = document.getElementById('seguroCard');
    if (profile && profile.tieneSeguro && profile.aseguradora) {
      card.innerHTML =
        '<div class="seguro-card"><b>Tu seguro: ' + esc(profile.aseguradora) + '</b><br>' +
        'Póliza: ' + esc(profile.poliza || '—') + '<br><br>' +
        '<a class="call" style="display:flex; min-height:54px; border-radius:12px; align-items:center; justify-content:center; font-size:17px; font-weight:700; text-decoration:none;" href="tel:' + esc((profile.telAseg || '').replace(/\D/g, '')) + '">📞 Llamar a mi aseguradora</a>' +
        '<p class="muted" style="margin-top:8px;">Ten tu póliza a la mano: ' + esc(profile.poliza || '') + '</p></div>';
    } else {
      card.innerHTML = '<p class="muted center" style="margin-top:16px;">¿Tienes seguro de carro? Guárdalo en “Mis datos y mi seguro” para que la próxima vez te ayudemos a avisarle.</p>';
    }
    fotoDataUrl = null;
    show('p-confirm');
  } catch (e) { toast(e.message); }
}

/* ---------- Pantalla 9: panel del taller ---------- */
async function openPanel() {
  if (!user || user.role !== 'workshop') { toast('Esta pantalla es solo para talleres.'); return; }
  try {
    const d = await api('/api/panel');
    renderPanel(d);
    show('p-panel');
  } catch (e) { toast(e.message); }
}
// Un taller en espera activa su cuenta con el código que Orlan le
// entregó en persona cuando fue a verificarlo.
async function activarTaller() {
  const errEl = document.getElementById('activarErr');
  errEl.textContent = '';
  const code = document.getElementById('activarCodigo').value.trim();
  if (!code) { errEl.textContent = 'Escribe el código que te entregaron.'; return; }
  try {
    await api('/api/workshop-activate', { method: 'POST', body: { inviteCode: code } });
    if (user) user.approved = true;
    document.getElementById('activarCodigo').value = '';
    toast('¡Tu taller ya está activo! ✓');
    openPanel();
  } catch (e) { errEl.textContent = e.message; }
}
function renderPanel(d) {
  const t = d.taller;
  document.getElementById('panelSub').textContent = t.nombre + ' · Plan ' + t.plan + (t.activo ? '' : ' · PAUSADO');
  document.getElementById('panelPendiente').style.display = t.aprobado ? 'none' : 'block';
  document.getElementById('pausaBtn').textContent = t.activo ? 'Pausar mi anuncio' : 'Volver a aparecer';

  const box = document.getElementById('panelSolicitudes');
  box.innerHTML = '';
  if (!d.solicitudes.length) box.innerHTML = '<p class="calm">Todavía no te llega ninguna solicitud.</p>';
  d.solicitudes.forEach(s => {
    const div = document.createElement('div');
    div.className = 'card'; div.style.cursor = 'default';
    const foto = s.fotoKey ? '<br><a href="/api/foto?key=' + encodeURIComponent(s.fotoKey) + '&token=' + getToken() + '" target="_blank" rel="noopener" style="color:#7fb3e8;">📷 Ver foto</a>' : '';
    div.innerHTML = '<h3>' + esc(s.driverName || 'Conductor') + (s.estado === 'nueva' ? ' <span class="badge red">NUEVO</span>' : '') + '</h3>' +
      '<div class="meta"><b>' + esc(s.incidentLabel || s.incident) + '</b>' + (s.descripcion ? ' · ' + esc(s.descripcion) : '') + '<br>' +
      '🚗 ' + esc(carroLabel(s.carro) || 'Carro no registrado') + '<br>' +
      (s.distKm != null ? '📍 A ' + Number(s.distKm).toFixed(1) + ' km · ' : '') + new Date(s.createdAt).toLocaleString('es-MX') + foto + '</div>' +
      '<div class="actions">' +
      (s.driverPhone ? '<a class="call" href="tel:' + esc(s.driverPhone.replace(/\D/g, '')) + '">📞 Llamar</a>' : '') +
      (s.driverPhone ? '<a class="wa" href="https://wa.me/52' + esc(s.driverPhone.replace(/\D/g, '')) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') +
      '</div>';
    box.appendChild(div);
  });

  const serv = document.getElementById('panelServicios');
  serv.innerHTML = '';
  const servicios = d.servicios.length ? d.servicios : [{ nombre: 'Carrocería/hojalatería', precio: '' }, { nombre: 'Pintura', precio: '' }, { nombre: 'Mecánica general', precio: '' }];
  servicios.forEach((sv, i) => {
    serv.innerHTML += '<label>' + esc(sv.nombre) + '</label><input data-serv="' + i + '" data-nombre="' + esc(sv.nombre) + '" value="' + esc(sv.precio || '') + '" placeholder="Precio (ej. Desde $1,500)">';
  });

  const of = document.getElementById('panelOfertas');
  of.innerHTML = '';
  if (!d.ofertas.length) of.innerHTML = '<p class="calm">No tienes ofertas publicadas.</p>';
  d.ofertas.forEach(o => {
    const div = document.createElement('div');
    div.className = 'card'; div.style.cursor = 'default';
    div.innerHTML = '<h3>' + esc(o.titulo) + (o.activa ? '' : ' <span class="badge">PAUSADA</span>') + '</h3>' +
      '<div class="meta"><b>' + esc(o.precio) + '</b> · ' + esc(o.vigencia) + '</div>' +
      '<button class="ghost" onclick="toggleOferta(' + o.id + ', ' + (!o.activa) + ')">' + (o.activa ? 'Pausar oferta' : 'Volver a publicar') + '</button>';
    of.appendChild(div);
  });

  document.getElementById('pNombre').value = t.nombre;
  document.getElementById('pWa').value = t.whatsapp || '';
  document.getElementById('pHorario').value = t.horario || '';
  document.getElementById('pZona').value = t.zona || '';
  document.getElementById('pDireccion').value = t.direccion || '';
  document.getElementById('pServiciosTexto').value = t.serviciosTexto || '';
  document.getElementById('pCostoVisita').value = (t.costoVisita == null ? '' : t.costoVisita);
  document.getElementById('pGrua').checked = !!t.tieneGrua;
  document.getElementById('pDomicilio').checked = !!t.aDomicilio;

  document.getElementById('panelStats').innerHTML =
    '👀 Te vieron <b>' + d.stats.vistas7d + ' veces</b> esta semana<br>' +
    '📞 Te llamaron <b>' + d.stats.llamadas7d + ' veces</b><br>' +
    '🔔 Te avisaron <b>' + d.stats.avisos7d + ' veces</b>';
  document.getElementById('panelPlan').innerHTML =
    'Plan <b>' + esc(t.plan) + '</b><br>' +
    (t.activo
      ? '<span class="open">● Activo — tu taller sí aparece en las búsquedas</span><br>✓ Apareces primero: los talleres con la app salen antes que los de Google.'
      : '<b style="color:#ff8a8a;">● Pausado — tu taller NO aparece en las búsquedas</b>');
}
async function saveServicios() {
  const servicios = [];
  document.querySelectorAll('#panelServicios input[data-serv]').forEach(inp => {
    servicios.push({ nombre: inp.getAttribute('data-nombre'), precio: inp.value.trim() });
  });
  try {
    await api('/api/panel-services', { method: 'POST', body: { servicios } });
    toast('Servicios guardados ✓');
  } catch (e) { toast(e.message); }
}
async function addOferta() {
  const titulo = document.getElementById('oTitulo').value.trim();
  if (!titulo) { toast('Escribe el título de la oferta'); return; }
  try {
    await api('/api/panel-offer-create', {
      method: 'POST',
      body: { titulo, precio: document.getElementById('oPrecio').value.trim(), vigencia: document.getElementById('oVigencia').value.trim() },
    });
    document.getElementById('oTitulo').value = '';
    document.getElementById('oPrecio').value = '';
    document.getElementById('oVigencia').value = '';
    toast('Oferta publicada ✓');
    openPanel();
  } catch (e) { toast(e.message); }
}
async function toggleOferta(id, activa) {
  try {
    await api('/api/panel-offer-toggle', { method: 'POST', body: { offerId: id, activa } });
    openPanel();
  } catch (e) { toast(e.message); }
}
async function savePerfil() {
  try {
    await api('/api/panel-profile', {
      method: 'POST',
      body: {
        nombre: document.getElementById('pNombre').value.trim(),
        whatsapp: document.getElementById('pWa').value.trim(),
        horario: document.getElementById('pHorario').value.trim(),
        zona: document.getElementById('pZona').value.trim(),
        direccion: document.getElementById('pDireccion').value.trim(),
        servicios: document.getElementById('pServiciosTexto').value.trim(),
        costoVisita: document.getElementById('pCostoVisita').value.trim(),
        tieneGrua: document.getElementById('pGrua').checked,
        aDomicilio: document.getElementById('pDomicilio').checked,
      },
    });
    toast('Perfil guardado ✓');
  } catch (e) { toast(e.message); }
}
async function togglePausa() {
  try {
    const d = await api('/api/panel');
    const pausado = d.taller.activo; // si está activo, lo pausamos
    const r = await api('/api/panel-pause', { method: 'POST', body: { pausado } });
    toast(r.taller.activo ? 'Tu anuncio está activo otra vez ✓' : 'Tu anuncio quedó pausado');
    openPanel();
  } catch (e) { toast(e.message); }
}

/* ---------- Pantalla: códigos de invitación (dueño) ---------- */
async function openCodigos() {
  if (!user || !user.isOwner) { toast('Solo el dueño puede hacer esto.'); return; }
  await refreshCodigos();
  await refreshPendientes();
  show('p-codigos');
}
async function refreshPendientes() {
  try {
    const d = await api('/api/pending-workshops');
    const list = document.getElementById('pendientesList');
    list.innerHTML = '';
    if (!d.pendientes.length) {
      list.innerHTML = '<p class="calm">No hay talleres en espera ahorita.</p>';
      return;
    }
    d.pendientes.forEach(p => {
      const div = document.createElement('div');
      div.className = 'card'; div.style.cursor = 'default';
      div.innerHTML = '<h3>' + esc(p.nombre) + '</h3>' +
        '<div class="meta">' + esc(p.contacto) + '<br>' +
        esc(p.email) + (p.telefono ? ' · ' + esc(p.telefono) : '') + '<br>' +
        'Se registró: ' + new Date(p.registrado).toLocaleDateString('es-MX') + '<br>' +
        'Visítalo y entrégale un código para activarlo.</div>';
      list.appendChild(div);
    });
  } catch (e) { toast(e.message); }
}
async function refreshCodigos() {
  try {
    const d = await api('/api/invite-codes-list');
    const list = document.getElementById('codigosList');
    list.innerHTML = '';
    if (!d.codigos.length) {
      list.innerHTML = '<p class="calm">Todavía no has generado ningún código.</p>';
      return;
    }
    d.codigos.forEach(c => {
      const div = document.createElement('div');
      div.className = 'card'; div.style.cursor = 'default';
      const estado = c.usado
        ? '<span class="badge">USADO por ' + esc(c.usedByName || 'un taller') + (c.usedAt ? ' · ' + new Date(c.usedAt).toLocaleDateString('es-MX') : '') + '</span>'
        : '<span class="badge prem">DISPONIBLE</span>';
      div.innerHTML = '<h3>' + esc(c.code) + ' ' + estado + '</h3>' +
        '<div class="meta">' + (c.note ? esc(c.note) + '<br>' : '') +
        'Creado: ' + new Date(c.createdAt).toLocaleDateString('es-MX') + '</div>' +
        '<div class="actions">' +
        '<button class="ghost" style="flex:1;" onclick="copiarCodigo(\'' + esc(c.code) + '\')">Copiar</button>' +
        (c.usado ? '' : '<button class="ghost" style="flex:1;" onclick="desactivarCodigo(\'' + esc(c.code) + '\')">Desactivar</button>') +
        '</div>';
      list.appendChild(div);
    });
  } catch (e) { toast(e.message); }
}
async function generarCodigo() {
  try {
    const d = await api('/api/invite-code-create', { method: 'POST', body: { note: document.getElementById('codigoNota').value.trim() } });
    const box = document.getElementById('codigoNuevo');
    box.style.display = 'block';
    box.innerHTML = '<div class="card" style="cursor:default; border:2px solid #f5b301;">' +
      '<h3 style="font-size:24px; letter-spacing:1px;">' + esc(d.codigo.code) + '</h3>' +
      '<div class="meta">Entrégaselo al taller en persona. Solo sirve una vez.</div>' +
      '<button class="primary" onclick="copiarCodigo(\'' + esc(d.codigo.code) + '\')">Copiar código</button></div>';
    document.getElementById('codigoNota').value = '';
    await refreshCodigos();
  } catch (e) { toast(e.message); }
}
async function copiarCodigo(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast('Código copiado ✓');
  } catch (_) {
    toast(code);
  }
}
async function desactivarCodigo(code) {
  if (!window.confirm('¿Desactivar el código ' + code + '? Ya no servirá para activar la cuenta.')) return;
  try {
    await api('/api/invite-code-deactivate', { method: 'POST', body: { code } });
    toast('Código desactivado');
    await refreshCodigos();
  } catch (e) { toast(e.message); }
}

/* ---------- Carrusel del inicio ---------- */
// 3 imágenes originales que cambian solas cada 5 segundos, con su
// frase. Los puntitos dejan cambiar de imagen a mano.
let carruselIdx = 0;
let carruselTimer = null;
function pintarCarrusel() {
  const track = document.getElementById('carruselTrack');
  if (!track) return;
  track.style.transform = 'translateX(-' + (carruselIdx * 100) + '%)';
  document.querySelectorAll('#carruselPuntos button').forEach((b, i) => b.classList.toggle('sel', i === carruselIdx));
}
function initCarrusel() {
  const track = document.getElementById('carruselTrack');
  const puntos = document.getElementById('carruselPuntos');
  if (!track || !puntos || puntos.children.length) return;
  const n = track.children.length;
  for (let i = 0; i < n; i++) {
    const b = document.createElement('button');
    b.setAttribute('aria-label', 'Imagen ' + (i + 1));
    b.onclick = () => { carruselIdx = i; pintarCarrusel(); };
    puntos.appendChild(b);
  }
  pintarCarrusel();
  carruselTimer = setInterval(() => { carruselIdx = (carruselIdx + 1) % n; pintarCarrusel(); }, 5000);
}

/* ---------- Inicio ---------- */
(async function init() {
  initCarrusel();
  await loadFocos();
  if (getToken()) {
    try {
      const st = await api('/api/auth-status');
      if (st.user) {
        user = st.user; workshop = st.workshop || null;
        try {
          const d = await api('/api/driver-profile');
          profile = d.profile;
        } catch (_) {}
        document.getElementById('panelLink').style.display = (user.role === 'workshop') ? 'block' : 'none';
        document.getElementById('codigosLink').style.display = (user.isOwner) ? 'block' : 'none';
        document.getElementById('savedLine').textContent = 'Hola, ' + user.name.split(' ')[0] + ' ✓';
        await refreshBell();
        // Un taller en espera entra directo a su panel (aviso de la
        // visita + campo para meter su código).
        if (user.role === 'workshop' && user.approved === false) { openPanel(); return; }
        show('p-home');
        return;
      }
    } catch (_) { localStorage.removeItem(TOKEN_KEY); }
  }
  show('p-auth');
})();
