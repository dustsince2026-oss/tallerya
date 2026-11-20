// Grúa: dos lugares (recoger / llevar) + km del traslado por ruta real.
// Frontend con jsdom (flujo completo) y backend (ruta grua-distancia con
// Nominatim + OSRM, con fetch stubbeado).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('/home/hatch/workspace/onlyclick-form-fotografos/node_modules/jsdom');

// El carrusel deja un setInterval corriendo: al cerrar la ventana jsdom
// lo limpia, si no el proceso de pruebas no termina nunca.
const wins = [];
after(() => wins.forEach(w => { try { w.close(); } catch (_) {} }));

const DIR = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

const TALLER_GRUA = {
  id: 5, source: 'app', enApp: true, nombre: 'Grúas Ensenada',
  esp: 'Grúa', tipos: ['grua'], zona: 'Valle Verde',
  dir: '', tel: '6461112233', horario: '24 horas', rating: 4.5, opiniones: 12,
  plan: 'Basico', distKm: 1.2, lat: null, lng: null, abierto: true,
  servicios: '', tieneGrua: true, aDomicilio: false, costoVisita: null, ofertas: [],
};

async function makeDom(distanciaMode) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const captured = { notify: null, search: false, distanciaBody: null };
  const fetchStub = async (url, opts) => {
    const u = String(url);
    if (u.includes('/api/reverse-geocode')) {
      return { ok: true, status: 200, json: async () => ({ direccion: 'Av. Ignacio L. Rayón 273, Independencia, Ensenada' }) };
    }
    if (u.includes('/api/grua-distancia')) {
      captured.distanciaBody = JSON.parse(opts.body);
      if (distanciaMode === 'fail') return { ok: false, status: 502, json: async () => ({ error: 'No pudimos calcular la distancia ahorita. Inténtalo de nuevo.' }) };
      return { ok: true, status: 200, json: async () => ({ km: 12.4, destino: 'Av. Reforma 232, Independencia, Ensenada', destinoLat: 31.861, destinoLng: -116.6066 }) };
    }
    if (u.includes('/api/notify')) {
      captured.notify = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ whatsappUrl: 'https://wa.me/526461112233' }) };
    }
    if (u.includes('/api/focos')) return { ok: true, status: 200, json: async () => ({ focos: [] }) };
    if (u.includes('/api/search')) {
      captured.search = true;
      return { ok: true, status: 200, json: async () => ({
        shops: [TALLER_GRUA], resTitle: 'Grúas cerca de ti', googleDisponible: false }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  globalThis.fetch = fetchStub;
  window.fetch = fetchStub;
  window.eval(appJs + '\n;window.__test = { searchShops, show, notifyShop, setOrigenGrua, setUser: (u) => { user = u; }, setLoc: (la, ln) => { lat = la; lng = ln; } };');
  await new Promise(r => setTimeout(r, 50));
  wins.push(window);
  return { window, document: window.document, t: window.__test, captured };
}

const active = (doc, id) => doc.getElementById(id).classList.contains('active');
const incBtns = (doc) => [...doc.querySelectorAll('#incidentGrid button')];

test('grúa muestra los dos lugares en datos (recogida prellenada, destino vacío)', async () => {
  const { document: doc } = await makeDom('ok');
  incBtns(doc)[2].click(); // Necesito grúa
  assert.ok(active(doc, 'p-datos'));
  assert.equal(doc.getElementById('gruaBox').style.display, 'block');
  assert.equal(doc.getElementById('dRecogida').value, 'Mi ubicación actual');
  assert.equal(doc.getElementById('dDestino').value, '');
  assert.equal(doc.getElementById('gruaDistancia').textContent, '');
});

test('recogida tiene UN solo botón de ubicación; el cuadro dice Mi ubicación actual', async () => {
  const { document: doc } = await makeDom('ok');
  incBtns(doc)[2].click(); // Necesito grúa
  assert.equal(doc.getElementById('btnOrigenGps'), null, 'no debe haber un segundo botón de ubicación');
  assert.ok(doc.getElementById('btnOrigenManual'), 'el enlace para escribir a mano sí existe');
  const input = doc.getElementById('dRecogida');
  assert.equal(input.disabled, true);
  assert.equal(input.value, 'Mi ubicación actual');
});

test('picar Escribir la dirección a mano habilita el cuadro para escribir', async () => {
  const { document: doc } = await makeDom('ok');
  incBtns(doc)[2].click();
  doc.getElementById('btnOrigenManual').click();
  const input = doc.getElementById('dRecogida');
  assert.equal(input.disabled, false);
  assert.equal(input.value, '');
  assert.ok(input.placeholder.includes('Av. Reforma'));
});

test('con GPS, el cuadro se llena solo con tu dirección actual', async () => {
  const { document: doc, t } = await makeDom('ok');
  t.setLoc(31.8631, -116.5959);
  incBtns(doc)[2].click();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(doc.getElementById('dRecogida').value, 'Av. Ignacio L. Rayón 273, Independencia, Ensenada');
  assert.equal(doc.getElementById('dRecogida').disabled, true);
});

test('origen manual: manda origenDireccion y calcula los km sin GPS', async () => {
  const { document: doc, t, captured } = await makeDom('ok');
  incBtns(doc)[2].click();
  doc.getElementById('btnOrigenManual').click();
  doc.getElementById('dRecogida').value = 'Av. Rayón 273, Ensenada';
  doc.getElementById('dDestino').value = 'Taller El Toro, Av. Reforma';
  await t.searchShops();
  assert.ok(active(doc, 'p-resultados'));
  assert.equal(captured.distanciaBody.origenDireccion, 'Av. Rayón 273, Ensenada');
  assert.equal(captured.distanciaBody.origenLat, undefined);
  assert.ok(doc.getElementById('gruaDistancia').textContent.includes('Distancia del traslado: 12.4 km'));
});

test('origen manual vacío no busca', async () => {
  const { document: doc, t, captured } = await makeDom('ok');
  incBtns(doc)[2].click();
  doc.getElementById('btnOrigenManual').click();
  doc.getElementById('dDestino').value = 'Taller El Toro, Av. Reforma';
  await t.searchShops();
  assert.equal(captured.search, false);
  assert.equal(captured.distanciaBody, null);
});

test('sin destino no busca grúas', async () => {
  const { document: doc, t, captured } = await makeDom('ok');
  incBtns(doc)[2].click();
  await t.searchShops();
  assert.equal(captured.search, false);
  assert.ok(!active(doc, 'p-resultados'));
});

test('con destino calcula los km, salen en resultados y en el aviso a la grúa', async () => {
  const { document: doc, t, captured } = await makeDom('ok');
  incBtns(doc)[2].click();
  t.setLoc(31.8631, -116.5959);
  doc.getElementById('dDestino').value = 'Taller El Toro, Av. Reforma';
  await t.searchShops();
  assert.ok(active(doc, 'p-resultados'));
  assert.equal(captured.distanciaBody.destino, 'Taller El Toro, Av. Reforma');
  assert.equal(captured.distanciaBody.origenLat, 31.8631);
  assert.ok(doc.getElementById('gruaDistancia').textContent.includes('Distancia del traslado: 12.4 km'));
  assert.ok(doc.getElementById('resSub').textContent.includes('Traslado: 12.4 km'));
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  assert.equal(captured.notify.descripcion, 'Necesito grúa · Recoger en: Mi ubicación actual · Llevar a: Taller El Toro, Av. Reforma (12.4 km)');
  assert.equal(captured.notify.incident, 'grua');
});

test('si el cálculo falla, la búsqueda sigue sin km', async () => {
  const { document: doc, t, captured } = await makeDom('fail');
  incBtns(doc)[2].click();
  t.setLoc(31.8631, -116.5959);
  doc.getElementById('dDestino').value = 'Taller El Toro, Av. Reforma';
  await t.searchShops();
  assert.ok(captured.search);
  assert.ok(active(doc, 'p-resultados'));
  assert.ok(doc.getElementById('gruaDistancia').textContent.includes('No se pudo calcular'));
  assert.ok(!doc.getElementById('resSub').textContent.includes('Traslado:'));
});

test('sin GPS no hay km pero sí búsqueda', async () => {
  const { document: doc, t, captured } = await makeDom('ok');
  incBtns(doc)[2].click();
  doc.getElementById('dDestino').value = 'Taller El Toro, Av. Reforma';
  await t.searchShops();
  assert.ok(captured.search);
  assert.equal(captured.distanciaBody, null);
  assert.ok(doc.getElementById('gruaDistancia').textContent.includes('Activa tu ubicación'));
});

// ---------------- Backend: ruta grua-distancia ----------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tallerya-grua-test-'));
process.env.TALLERYA_DATA_DIR = TMP;
process.env.AUTH_SECRET = 'test-secret-tallerya';
process.env.OWNER_EMAIL = 'dueno@tallerya.mx';
const { dispatch } = require('../api/_lib/handlers');

function stubFetchGeoOsrm({ geo = [{ lat: '31.8610', lon: '-116.6066', display_name: 'Av. Reforma 232, Independencia, Ensenada' }], distance = 12400 } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('nominatim')) return { ok: true, status: 200, json: async () => geo };
    if (u.includes('router.project-osrm.org')) return { ok: true, status: 200, json: async () => ({ routes: [{ distance }] }) };
    throw new Error('fetch inesperado: ' + u);
  };
}

async function expectErr(promise, status) {
  try { await promise; } catch (e) {
    assert.equal(e.status, status, 'esperaba error ' + status + ', llegó ' + e.status + ': ' + e.message);
    return e;
  }
  assert.fail('esperaba error ' + status + ' y no falló');
}

test('backend: calcula 12.4 km por ruta entre recogida y destino', async () => {
  stubFetchGeoOsrm();
  const r = await dispatch('grua-distancia', { body: { origenLat: 31.8631, origenLng: -116.5959, destino: 'Av. Reforma 232' }, query: {}, token: null });
  assert.equal(r.status, 200);
  assert.equal(r.data.km, 12.4);
  assert.equal(r.data.destinoLat, 31.861);
});

test('backend: sin destino o sin origen da 400', async () => {
  stubFetchGeoOsrm();
  await expectErr(dispatch('grua-distancia', { body: { origenLat: 31.86, origenLng: -116.59, destino: '  ' }, query: {}, token: null }), 400);
  await expectErr(dispatch('grua-distancia', { body: { destino: 'Av. Reforma' }, query: {}, token: null }), 400);
});

test('backend: dirección no encontrada da 400', async () => {
  stubFetchGeoOsrm({ geo: [] });
  await expectErr(dispatch('grua-distancia', { body: { origenLat: 31.86, origenLng: -116.59, destino: 'asdf qwer' }, query: {}, token: null }), 400);
});

test('backend: sin ruta da 400', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('nominatim')) return { ok: true, status: 200, json: async () => [{ lat: '31.8610', lon: '-116.6066', display_name: 'Av. Reforma 232' }] };
    if (u.includes('router.project-osrm.org')) return { ok: true, status: 200, json: async () => ({ routes: [] }) };
    throw new Error('fetch inesperado: ' + u);
  };
  await expectErr(dispatch('grua-distancia', { body: { origenLat: 31.86, origenLng: -116.59, destino: 'Av. Reforma 232' }, query: {}, token: null }), 400);
});

// ---------------- Backend: ruta reverse-geocode ----------------
test('backend: reverse-geocode devuelve la dirección corta', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    assert.ok(u.includes('reverse?'), 'debe llamar al reverse de Nominatim');
    return { ok: true, status: 200, json: async () => ({
      address: { road: 'Av. Ignacio L. Rayón', house_number: '273', suburb: 'Independencia', city: 'Ensenada' },
      display_name: 'Av. Ignacio L. Rayón, 273, Independencia, Ensenada, Baja California, México' }) };
  };
  const r = await dispatch('reverse-geocode', { body: { lat: 31.8631, lng: -116.5959 }, query: {}, token: null });
  assert.equal(r.status, 200);
  assert.equal(r.data.direccion, 'Av. Ignacio L. Rayón 273, Independencia, Ensenada');
});

test('backend: reverse-geocode sin coordenadas da 400', async () => {
  await expectErr(dispatch('reverse-geocode', { body: {}, query: {}, token: null }), 400);
});

test('backend: grua-distancia con origen manual geocodifica el origen', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('nominatim')) {
      if (u.includes('Reforma')) return { ok: true, status: 200, json: async () => [{ lat: '31.8610', lon: '-116.6066', display_name: 'Av. Reforma 232, Independencia, Ensenada' }] };
      return { ok: true, status: 200, json: async () => [{ lat: '31.8631', lon: '-116.5959', display_name: 'Av. Ignacio L. Rayón 273, Independencia, Ensenada' }] };
    }
    if (u.includes('router.project-osrm.org')) {
      assert.ok(u.includes('-116.5959,31.8631;-116.6066,31.861'), 'la ruta debe salir del origen manual: ' + u);
      return { ok: true, status: 200, json: async () => ({ routes: [{ distance: 2900 }] }) };
    }
    throw new Error('fetch inesperado: ' + u);
  };
  const r = await dispatch('grua-distancia', { body: { origenDireccion: 'Av. Rayón 273, Ensenada', destino: 'Av. Reforma 232' }, query: {}, token: null });
  assert.equal(r.status, 200);
  assert.equal(r.data.km, 2.9);
});

test('backend: grua-distancia con origen manual no encontrado da 400', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('nominatim')) return { ok: true, status: 200, json: async () => [] };
    throw new Error('fetch inesperado: ' + u);
  };
  await expectErr(dispatch('grua-distancia', { body: { origenDireccion: 'asdf qwer', destino: 'Av. Reforma 232' }, query: {}, token: null }), 400);
});
