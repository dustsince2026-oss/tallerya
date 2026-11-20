// "Yo conduzco el auto hasta el taller": en esos modos NO se pide la
// ubicación del conductor — el botón de ubicación se esconde y la
// búsqueda va sin coordenadas. La llantera "más cercana" sí la ocupa.
const fs = require('node:fs');
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
  id: 1, source: 'app', enApp: true, nombre: 'Taller El Faro',
  esp: 'Carrocería/hojalatería', tipos: ['hojalateria'], zona: 'Valle Verde',
  dir: '', tel: '6461112233', horario: '9:00 - 18:00', rating: 4.8, opiniones: 32,
  plan: 'Basico', distKm: 1.2, lat: null, lng: null, abierto: true,
  servicios: '', tieneGrua: false, aDomicilio: true, costoVisita: 300, ofertas: [],
};

async function makeDom() {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const captured = { searchUrl: null, notify: null };
  const fetchStub = async (url, opts) => {
    const u = String(url);
    if (u.includes('/api/reverse-geocode')) {
      return { ok: true, status: 200, json: async () => ({ direccion: 'Av. Rayón 273, Independencia, Ensenada' }) };
    }
    if (u.includes('/api/notify')) {
      captured.notify = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ whatsappUrl: 'https://wa.me/526461112233' }) };
    }
    if (u.includes('/api/focos')) return { ok: true, status: 200, json: async () => ({ focos: [] }) };
    if (u.includes('/api/search')) {
      captured.searchUrl = u;
      return { ok: true, status: 200, json: async () => ({ shops: [TALLER], resTitle: 'Talleres cerca de ti', googleDisponible: false }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  globalThis.fetch = fetchStub;
  window.fetch = fetchStub;
  window.eval(appJs + '\n;window.__test = { searchShops, show, notifyShop, setUser: (u) => { user = u; }, setLoc: (la, ln) => { lat = la; lng = ln; } };');
  await new Promise(r => setTimeout(r, 50));
  wins.push(window);
  return { window, document: window.document, t: window.__test, captured };
}

const active = (doc, id) => doc.getElementById(id).classList.contains('active');
const incBtns = (doc) => [...doc.querySelectorAll('#incidentGrid button')];
const hasLat = (url) => new URL(url, 'http://localhost/').searchParams.has('lat');

test('choque "yo conduzco": sin botón de ubicación y búsqueda sin coordenadas', async () => {
  const { document: doc, t, captured } = await makeDom();
  incBtns(doc)[0].click(); // Choqué
  assert.ok(active(doc, 'p-choque-modo'));
  [...doc.querySelectorAll('#choqueModos button')][1].click(); // yo conduzco
  assert.ok(active(doc, 'p-datos'));
  assert.equal(doc.getElementById('locBox').style.display, 'none');
  assert.equal(doc.getElementById('datosTitle').textContent, 'Tú llevas el carro al taller');
  assert.ok(doc.getElementById('datosNote').textContent.includes('tú eliges'));
  await t.searchShops();
  assert.ok(captured.searchUrl);
  assert.equal(hasLat(captured.searchUrl), false);
  assert.ok(doc.getElementById('resList').textContent.includes('Taller El Faro'));
});

test('mecánico "puedo manejar": sin botón de ubicación y búsqueda sin coordenadas', async () => {
  const { document: doc, t, captured } = await makeDom();
  incBtns(doc)[1].click(); // No arranca
  assert.ok(active(doc, 'p-mecanico-modo'));
  [...doc.querySelectorAll('#mecanicoModos button')][2].click(); // puedo manejar
  assert.ok(active(doc, 'p-datos'));
  assert.equal(doc.getElementById('locBox').style.display, 'none');
  assert.equal(doc.getElementById('datosTitle').textContent, 'Tú llevas el carro al taller');
  await t.searchShops();
  assert.equal(hasLat(captured.searchUrl), false);
});

test('choque en el lugar (URGENTE): sí pide ubicación y busca con coordenadas', async () => {
  const { document: doc, t, captured } = await makeDom();
  t.setLoc(31.8631, -116.5959);
  incBtns(doc)[0].click();
  [...doc.querySelectorAll('#choqueModos button')][0].click(); // lugar del percance
  assert.ok(active(doc, 'p-datos'));
  assert.notEqual(doc.getElementById('locBox').style.display, 'none');
  assert.ok(doc.getElementById('datosTitle').textContent.includes('¿Dónde estás?'));
  await t.searchShops();
  assert.equal(hasLat(captured.searchUrl), true);
});

test('llantera más cercana: sí pide ubicación', async () => {
  const { document: doc, t } = await makeDom();
  t.setLoc(31.8631, -116.5959);
  incBtns(doc)[3].click(); // Llantera
  [...doc.querySelectorAll('#llanteraModos button')][1].click(); // la más cercana
  assert.ok(active(doc, 'p-datos'));
  assert.notEqual(doc.getElementById('locBox').style.display, 'none');
});

test('choque a domicilio: sí pide ubicación (el domicilio es tu ubicación por defecto)', async () => {
  const { document: doc, t } = await makeDom();
  t.setLoc(31.8631, -116.5959);
  incBtns(doc)[0].click();
  [...doc.querySelectorAll('#choqueModos button')][2].click(); // a domicilio
  assert.ok(active(doc, 'p-datos'));
  assert.notEqual(doc.getElementById('locBox').style.display, 'none');
  assert.notEqual(doc.getElementById('domicilioBox').style.display, 'none');
});

test('aviso al taller en modo conduzco: sin coordenadas del conductor', async () => {
  const { document: doc, t, captured } = await makeDom();
  incBtns(doc)[0].click();
  [...doc.querySelectorAll('#choqueModos button')][1].click(); // yo conduzco
  await t.searchShops();
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  assert.equal(captured.notify.lat, null);
  assert.ok(captured.notify.descripcion.includes('yo conduzco'));
});
