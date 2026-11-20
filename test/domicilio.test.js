// Servicios a domicilio: si la persona no está en su casa cuando lo
// pide, escribe el domicilio a mano. El cuadro sale solo en los modos
// a domicilio (choque, mecánico, llantera); los talleres se buscan
// cerca DEL DOMICILIO y el aviso al taller lleva la dirección.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('/home/hatch/workspace/onlyclick-form-fotografos/node_modules/jsdom');

const wins = [];
after(() => wins.forEach(w => { try { w.close(); } catch (_) {} }));

const DIR = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

const TALLER = {
  id: 7, source: 'app', enApp: true, nombre: 'Taller El Toro',
  esp: 'Carrocería/hojalatería', tipos: ['hojalateria'], zona: 'Valle Verde',
  dir: 'Av. Reforma 500', tel: '6461112233', horario: '8:00 - 18:00',
  rating: 4.5, opiniones: 12, plan: 'Basico', distKm: 1.2, lat: null, lng: null,
  abierto: true, servicios: '', tieneGrua: false, aDomicilio: true,
  costoVisita: 300, ofertas: [],
};

async function makeDom() {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const captured = { notify: null, searchUrl: null };
  const fetchStub = async (url, opts) => {
    const u = String(url);
    if (u.includes('/api/reverse-geocode')) {
      return { ok: true, status: 200, json: async () => ({ direccion: 'Av. Ignacio L. Rayón 273, Independencia, Ensenada' }) };
    }
    if (u.includes('/api/geocode')) {
      return { ok: true, status: 200, json: async () => ({ lat: 31.861, lng: -116.6066, direccion: 'Av. Reforma 232, Independencia, Ensenada' }) };
    }
    if (u.includes('/api/notify')) {
      captured.notify = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ whatsappUrl: 'https://wa.me/526461112233' }) };
    }
    if (u.includes('/api/focos')) return { ok: true, status: 200, json: async () => ({ focos: [] }) };
    if (u.includes('/api/search')) {
      captured.searchUrl = u;
      return { ok: true, status: 200, json: async () => ({
        shops: [TALLER], resTitle: 'Talleres cerca de ti', googleDisponible: false }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  globalThis.fetch = fetchStub;
  window.fetch = fetchStub;
  window.eval(appJs + '\n;window.__test = { searchShops, show, notifyShop, useLocation, setUser: (u) => { user = u; }, setLoc: (la, ln) => { lat = la; lng = ln; } };');
  await new Promise(r => setTimeout(r, 50));
  wins.push(window);
  return { window, document: window.document, t: window.__test, captured };
}

const active = (doc, id) => doc.getElementById(id).classList.contains('active');
const incBtns = (doc) => [...doc.querySelectorAll('#incidentGrid button')];
const geoFalso = (window) => Object.defineProperty(window.navigator, 'geolocation', { value: {
  getCurrentPosition: (ok) => ok({ coords: { latitude: 31.8631, longitude: -116.5959 } }),
  watchPosition: () => 1,
}, configurable: true });

function irADomicilioChoque(doc) {
  incBtns(doc)[0].click(); // Choqué
  [...doc.querySelectorAll('#choqueModos button')][2].click(); // a domicilio
}

test('choque a domicilio muestra la casilla del domicilio', async () => {
  const { document: doc } = await makeDom();
  irADomicilioChoque(doc);
  assert.ok(active(doc, 'p-datos'));
  assert.equal(doc.getElementById('domicilioBox').style.display, 'block');
  const input = doc.getElementById('dDomicilio');
  assert.equal(input.disabled, true);
  assert.equal(input.value, 'Mi ubicación actual');
  assert.ok(doc.getElementById('btnDomicilioManual'));
});

test('mecánico y llantera a domicilio también muestran la casilla', async () => {
  const { document: doc } = await makeDom();
  incBtns(doc)[1].click(); // No arranca
  [...doc.querySelectorAll('#mecanicoModos button')][1].click(); // a domicilio
  assert.equal(doc.getElementById('domicilioBox').style.display, 'block');
  const { document: doc2 } = await makeDom();
  incBtns(doc2)[3].click(); // Llantera
  [...doc2.querySelectorAll('#llanteraModos button')][0].click(); // a domicilio
  assert.equal(doc2.getElementById('domicilioBox').style.display, 'block');
});

test('choque en el lugar del percance NO muestra la casilla', async () => {
  const { document: doc } = await makeDom();
  incBtns(doc)[0].click();
  [...doc.querySelectorAll('#choqueModos button')][0].click(); // lugar del percance
  assert.equal(doc.getElementById('domicilioBox').style.display, 'none');
});

test('el enlace escribir a mano habilita el cuadro y lo vacía', async () => {
  const { document: doc } = await makeDom();
  irADomicilioChoque(doc);
  doc.getElementById('btnDomicilioManual').click();
  const input = doc.getElementById('dDomicilio');
  assert.equal(input.disabled, false);
  assert.equal(input.value, '');
  assert.ok(input.placeholder.includes('Av. Reforma'));
});

test('con GPS, el cuadro del domicilio se llena con tu dirección', async () => {
  const { document: doc, t } = await makeDom();
  t.setLoc(31.8631, -116.5959);
  irADomicilioChoque(doc);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(doc.getElementById('dDomicilio').value, 'Av. Ignacio L. Rayón 273, Independencia, Ensenada');
  assert.equal(doc.getElementById('dDomicilio').disabled, true);
});

test('si la borras y vuelves a picar Usar mi ubicación, el domicilio se vuelve a poner', async () => {
  const { document: doc, window, t } = await makeDom();
  geoFalso(window);
  t.setLoc(31.8631, -116.5959);
  irADomicilioChoque(doc);
  await new Promise(r => setTimeout(r, 50));
  doc.getElementById('btnDomicilioManual').click();
  assert.equal(doc.getElementById('dDomicilio').value, '');
  t.useLocation();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(doc.getElementById('dDomicilio').value, 'Av. Ignacio L. Rayón 273, Independencia, Ensenada');
  assert.equal(doc.getElementById('dDomicilio').disabled, true);
});

test('domicilio escrito a mano: busca cerca del domicilio y el aviso lleva la dirección', async () => {
  const { document: doc, t, captured } = await makeDom();
  irADomicilioChoque(doc);
  doc.getElementById('btnDomicilioManual').click();
  doc.getElementById('dDomicilio').value = 'Av. Rayón 273, Ensenada';
  await t.searchShops();
  assert.ok(active(doc, 'p-resultados'));
  // La búsqueda usa las coordenadas DEL DOMICILIO (geocodificado),
  // no las de donde está la persona (que aquí ni siquiera tiene GPS).
  assert.ok(captured.searchUrl.includes('lat=31.861'), 'la búsqueda debe usar la lat del domicilio: ' + captured.searchUrl);
  assert.ok(captured.searchUrl.includes('lng=-116.6066'), 'la búsqueda debe usar la lng del domicilio: ' + captured.searchUrl);
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  assert.ok(captured.notify.descripcion.includes('Domicilio: Av. Rayón 273, Ensenada'), 'el aviso debe llevar el domicilio: ' + captured.notify.descripcion);
  assert.equal(captured.notify.lat, 31.861);
  assert.equal(captured.notify.lng, -116.6066);
});

test('domicilio escrito a mano pero vacío no busca', async () => {
  const { document: doc, t, captured } = await makeDom();
  irADomicilioChoque(doc);
  doc.getElementById('btnDomicilioManual').click();
  await t.searchShops();
  assert.equal(captured.searchUrl, null);
  assert.ok(!active(doc, 'p-resultados'));
});

test('domicilio con GPS: busca con tus coordenadas y el aviso lleva tu dirección', async () => {
  const { document: doc, t, captured } = await makeDom();
  t.setLoc(31.8631, -116.5959);
  irADomicilioChoque(doc);
  await new Promise(r => setTimeout(r, 50));
  await t.searchShops();
  assert.ok(captured.searchUrl.includes('lat=31.8631'));
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  assert.ok(captured.notify.descripcion.includes('Domicilio: Av. Ignacio L. Rayón 273, Independencia, Ensenada'));
});

// ---------------- Backend: ruta geocode ----------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tallerya-domicilio-test-'));
process.env.TALLERYA_DATA_DIR = TMP;
process.env.AUTH_SECRET = 'test-secret-tallerya';
process.env.OWNER_EMAIL = 'dueno@tallerya.mx';
const { dispatch } = require('../api/_lib/handlers');

async function expectErr(promise, status) {
  try { await promise; } catch (e) {
    assert.equal(e.status, status, 'esperaba error ' + status + ', llegó ' + e.status + ': ' + e.message);
    return e;
  }
  assert.fail('esperaba error ' + status + ' y no falló');
}

test('backend: geocode devuelve lat/lng de la dirección escrita', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    assert.ok(u.includes('nominatim'), 'debe geocodificar con Nominatim');
    assert.ok(u.includes('Ensenada'), 'debe agregar Ensenada para no caer en Mexicali');
    return { ok: true, status: 200, json: async () => [{ lat: '31.8610', lon: '-116.6066', display_name: 'Av. Reforma 232, Independencia, Ensenada' }] };
  };
  const r = await dispatch('geocode', { body: { direccion: 'Av. Reforma 232' }, query: {}, token: null });
  assert.equal(r.status, 200);
  assert.equal(r.data.lat, 31.861);
  assert.equal(r.data.lng, -116.6066);
  assert.ok(r.data.direccion.includes('Reforma'));
});

test('backend: geocode sin dirección o no encontrada da 400', async () => {
  await expectErr(dispatch('geocode', { body: { direccion: '   ' }, query: {}, token: null }), 400);
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  await expectErr(dispatch('geocode', { body: { direccion: 'asdf qwer' }, query: {}, token: null }), 400);
});
