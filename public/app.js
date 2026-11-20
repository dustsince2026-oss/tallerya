'use strict';
/* TallerYa — app de una sola página. Habla con /api/* (server.js).
   Sesión: token en localStorage, se manda como Bearer en cada llamada. */
const TOKEN_KEY = 'tallerya_token';

let user = null;          // {id, name, email, role, phone, isOwner, approved}
let workshop = null;      // {id, nombre, plan, activo} si el usuario es taller
let profile = null;       // perfil del conductor: {carros, tieneSeguro, aseguradora, poliza, telAseg}
let incident = null;      // incidente elegido {k, label, tipo, ...}
let results = [];
let currentShop = null;
let carroElegido = null;
let carrosVisibles = 1;
let lat = null, lng = null;
let fotoDataUrl = null;   // foto opcional del daño (data URL, máx 2 MB)
let focosSel = {};
let FOCOS = [];

const INCIDENTS = [
  { k: 'choque', label: '🚗 Choqué', sub: 'Hojalatería y pintura', tipo: 'hojalateria',
    buscar: 'Buscar taller ahora', resTitle: 'Talleres de hojalatería cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte el taller de hojalatería más cercano.' },
  { k: 'noarranca', label: '🔧 No arranca', sub: 'Mecánico o eléctrico', tipo: 'mecanico',
    buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte el taller más cercano.' },
  { k: 'grua', label: '🚛 Necesito grúa', sub: 'Arrastre al taller o a tu casa', tipo: 'grua',
    buscar: 'Buscar grúas cercanas', resTitle: 'Grúas cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte la grúa más cercana.' },
  { k: 'presupuesto', label: '🎨 Presupuesto de hojalatería', sub: 'Un hojalatero te cotiza', tipo: 'hojalateria',
    buscar: 'Buscar taller ahora', resTitle: 'Talleres de hojalatería cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte el taller de hojalatería más cercano.' },
  { k: 'electrico', label: '⚡ Falla eléctrica', sub: 'Eléctrico automotriz', tipo: 'electrico',
    buscar: 'Buscar taller eléctrico', resTitle: 'Talleres eléctricos cerca de ti',
    datosNote: 'Solo ocupamos esto para buscarte el taller eléctrico más cercano.' },
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

function pickIncident(inc) {
  if (inc.k === 'foquito') { show('p-foquito'); return; }
  incident = inc;
  document.getElementById('datosTitle').textContent = inc.label.replace(/^[^\s]+\s/, '') + ' — ¿Dónde estás?';
  document.getElementById('datosNote').textContent = inc.datosNote;
  document.getElementById('buscarBtn').textContent = inc.buscar;
  document.getElementById('otroBox').style.display = (inc.k === 'otro') ? 'block' : 'none';
  renderCarroPicker();
  show('p-datos');
}

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
    },
    () => {
      document.getElementById('locLine').textContent = 'No pudimos tomar tu ubicación. Buscamos con la zona de Ensenada.';
    },
    { timeout: 8000 }
  );
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

/* ---------- Pantalla 3: resultados ---------- */
async function searchShops() {
  if (!incident) incident = INCIDENTS[5];
  const q = new URLSearchParams({ incident: incident.k });
  if (incident.k === 'foquito' && incident.tipo) q.set('tipo', incident.tipo);
  if (lat != null && lng != null) { q.set('lat', lat); q.set('lng', lng); }
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
    document.getElementById('resSub').textContent = desc + 'Para: ' + incident.label.replace(/^[^\s]+\s/, '') + carroTxt + ' · Ensenada.';
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
      div.innerHTML =
        '<h3>' + esc(s.nombre) + (s.enApp ? '<span class="badge prem">✓ En la app</span>' : '<span class="badge">De Google</span>') +
        (s.plan === 'Premium' ? '<span class="badge prem">★ PREMIUM</span>' : (s.plan === 'Destacado' ? '<span class="badge">DESTACADO</span>' : '')) + '</h3>' +
        '<div class="esp">' + esc(s.esp) + '</div>' +
        '<div class="meta"><span class="stars">' + stars(s.rating) + '</span> ' + s.rating + ' (' + s.opiniones + ' opiniones)<br>' +
        '📍 ' + s.distKm.toFixed(1) + ' km · ' + esc(s.zona) + '<br>' +
        '<span class="open">● Abierto ahora</span> · ' + esc(s.horario) + '</div>' +
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
      (sh.servicios ? '🛠 ' + esc(sh.servicios) : '') + '</div>';
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
  }
});
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
  const descripcion = incident && incident.k === 'otro' ? document.getElementById('otroDesc').value.trim() : '';
  try {
    const d = await api('/api/notify', {
      method: 'POST',
      body: {
        workshopId: s.id, incident: incident ? incident.k : 'otro',
        descripcion, carro, lat, lng,
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
  const servicios = d.servicios.length ? d.servicios : [{ nombre: 'Hojalatería', precio: '' }, { nombre: 'Pintura', precio: '' }, { nombre: 'Mecánica general', precio: '' }];
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
  show('p-codigos');
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
  if (!window.confirm('¿Desactivar el código ' + code + '? Ya no servirá para registrarse.')) return;
  try {
    await api('/api/invite-code-deactivate', { method: 'POST', body: { code } });
    toast('Código desactivado');
    await refreshCodigos();
  } catch (e) { toast(e.message); }
}

/* ---------- Inicio ---------- */
(async function init() {
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
        show('p-home');
        return;
      }
    } catch (_) { localStorage.removeItem(TOKEN_KEY); }
  }
  show('p-auth');
})();
