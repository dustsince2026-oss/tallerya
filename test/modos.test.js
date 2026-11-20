// Modos de ayuda: Choqué (3) y No arranca (2). Flujo completo con jsdom:
// botón -> pantalla de modos -> datos -> resultados -> aviso al taller.
const fs = require('node:fs');
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

const TALLER_CHOQUE = {
  id: 1, source: 'app', enApp: true, nombre: 'Hojalatería El Faro',
  esp: 'Carrocería/hojalatería y pintura', tipos: ['hojalateria'], zona: 'Valle Verde',
  dir: '', tel: '6461112233', horario: '9:00 - 18:00', rating: 4.8, opiniones: 32,
  plan: 'Basico', distKm: 1.2, lat: null, lng: null, abierto: true,
  servicios: '', tieneGrua: false, aDomicilio: true, costoVisita: 300, ofertas: [],
};
const TALLER_MECANICO = {
  id: 2, source: 'app', enApp: true, nombre: 'Mecánica El Toro',
  esp: 'Mecánico', tipos: ['mecanico'], zona: 'Valle Verde',
  dir: '', tel: '6461112233', horario: '9:00 - 18:00', rating: 4.7, opiniones: 20,
  plan: 'Basico', distKm: 0.8, lat: null, lng: null, abierto: true,
  servicios: '', tieneGrua: false, aDomicilio: true, costoVisita: 250, ofertas: [],
};
const TALLER_LLANTERA = {
  id: 3, source: 'app', enApp: true, nombre: 'Llantera El Águila',
  esp: 'Llantera', tipos: ['llantera'], zona: 'Valle Verde',
  dir: '', tel: '6461112233', horario: '9:00 - 18:00', rating: 4.6, opiniones: 15,
  plan: 'Basico', distKm: 0.5, lat: null, lng: null, abierto: true,
  servicios: '', tieneGrua: false, aDomicilio: true, costoVisita: 200, ofertas: [],
};

async function makeDom() {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const captured = { notify: null };
  const fetchStub = async (url, opts) => {
    const u = String(url);
    if (u.includes('/api/notify')) {
      captured.notify = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ whatsappUrl: 'https://wa.me/526461112233' }) };
    }
    if (u.includes('/api/focos')) return { ok: true, status: 200, json: async () => ({ focos: [] }) };
    if (u.includes('/api/search')) {
      const inc = new URL(u, 'http://localhost/').searchParams.get('incident');
      const shop = inc === 'choque' ? TALLER_CHOQUE : inc === 'noarranca' ? TALLER_MECANICO : inc === 'llantera' ? TALLER_LLANTERA : null;
      return { ok: true, status: 200, json: async () => ({
        shops: shop ? [shop] : [], resTitle: 'Talleres cerca de ti', googleDisponible: false }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  globalThis.fetch = fetchStub;
  window.fetch = fetchStub;
  window.eval(appJs + '\n;window.__test = { searchShops, show, notifyShop, setUser: (u) => { user = u; } };');
  await new Promise(r => setTimeout(r, 50));
  wins.push(window);
  return { window, document: window.document, t: window.__test, captured };
}

const active = (doc, id) => doc.getElementById(id).classList.contains('active');
const incBtns = (doc) => [...doc.querySelectorAll('#incidentGrid button')];

test('No arranca abre su pantalla de modos con 3 opciones, URGENTE solo en donde se quedó el carro', async () => {
  const { document: doc } = await makeDom();
  assert.equal(incBtns(doc).length, 6);
  incBtns(doc)[1].click(); // No arranca
  assert.ok(active(doc, 'p-mecanico-modo'));
  assert.ok(!active(doc, 'p-datos'));
  assert.ok(!active(doc, 'p-choque-modo'));
  const modos = [...doc.querySelectorAll('#mecanicoModos button')];
  assert.equal(modos.length, 3);
  assert.ok(modos[0].textContent.includes('Necesito un mecánico en mi ubicación actual'));
  assert.ok(modos[0].textContent.includes('URGENTE'));
  assert.ok(modos[1].textContent.includes('Asistencia mecánica a domicilio'));
  assert.ok(!modos[1].textContent.includes('URGENTE'));
  assert.ok(modos[2].textContent.includes('Puedo manejar el carro hasta el taller'));
  assert.ok(!modos[2].textContent.includes('URGENTE'));
});

test('modo necesito un mecánico en mi ubicación actual: datos, subtítulo, tarjeta con el costo y aviso URGENTE con costo', async () => {
  const { document: doc, t, captured } = await makeDom();
  incBtns(doc)[1].click();
  [...doc.querySelectorAll('#mecanicoModos button')][0].click();
  assert.ok(active(doc, 'p-datos'));
  await t.searchShops();
  assert.ok(active(doc, 'p-resultados'));
  assert.ok(doc.getElementById('resSub').textContent.includes('en mi ubicación actual'));
  // La asistencia fuera del taller SÍ lleva costo por la visita.
  const resTxt = doc.getElementById('resList').textContent;
  assert.ok(resTxt.includes('Asistencia fuera del taller'));
  assert.ok(resTxt.includes('$250'));
  assert.ok(resTxt.includes('traslado'));
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  assert.equal(captured.notify.descripcion, 'URGENTE: Necesito un mecánico en mi ubicación actual (costo por la visita: $250 MXN)');
  assert.equal(captured.notify.incident, 'noarranca');
});

test('modo a domicilio: tarjeta con el costo y aviso con costo, sin URGENTE', async () => {
  const { document: doc, t, captured } = await makeDom();
  incBtns(doc)[1].click();
  [...doc.querySelectorAll('#mecanicoModos button')][1].click();
  await t.searchShops();
  const resTxt = doc.getElementById('resList').textContent;
  assert.ok(resTxt.includes('Asistencia fuera del taller'));
  assert.ok(resTxt.includes('$250'));
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  // A domicilio el aviso lleva el domicilio (sin GPS, es la ubicación actual).
  assert.equal(captured.notify.descripcion, 'Asistencia mecánica a domicilio (costo por la visita: $250 MXN) · Domicilio: Mi ubicación actual');
});

test('modo yo conduzco: subtítulo con el modo y aviso sin URGENTE ni costo', async () => {
  const { document: doc, t, captured } = await makeDom();
  incBtns(doc)[1].click();
  [...doc.querySelectorAll('#mecanicoModos button')][2].click();
  await t.searchShops();
  assert.ok(doc.getElementById('resSub').textContent.includes('Puedo manejar el carro hasta el taller'));
  assert.ok(!doc.getElementById('resList').textContent.includes('fuera del taller'));
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  assert.equal(captured.notify.descripcion, 'Puedo manejar el carro hasta el taller');
});

test('Llantera abre su pantalla de modos con 2 opciones, sin URGENTE', async () => {
  const { document: doc } = await makeDom();
  incBtns(doc)[3].click(); // Llantera
  assert.ok(active(doc, 'p-llantera-modo'));
  assert.ok(!active(doc, 'p-datos'));
  const modos = [...doc.querySelectorAll('#llanteraModos button')];
  assert.equal(modos.length, 2);
  assert.ok(modos[0].textContent.includes('Llantera a domicilio'));
  assert.ok(!modos[0].textContent.includes('URGENTE'));
  assert.ok(modos[1].textContent.includes('la llantera más cercana'));
  assert.ok(!modos[1].textContent.includes('URGENTE'));
});

test('modo llantera a domicilio: tarjeta con el costo y aviso con costo, sin URGENTE', async () => {
  const { document: doc, t, captured } = await makeDom();
  incBtns(doc)[3].click();
  [...doc.querySelectorAll('#llanteraModos button')][0].click();
  await t.searchShops();
  assert.ok(doc.getElementById('resSub').textContent.includes('Llantera a domicilio'));
  // La llantera a domicilio SÍ lleva costo por la visita (Orlan 2026-11-20).
  const resTxt = doc.getElementById('resList').textContent;
  assert.ok(resTxt.includes('Asistencia fuera del taller'));
  assert.ok(resTxt.includes('$200'));
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  assert.equal(captured.notify.descripcion, 'Llantera a domicilio (costo por la visita: $200 MXN) · Domicilio: Mi ubicación actual');
  assert.equal(captured.notify.incident, 'llantera');
});

test('modo la llantera más cercana: subtítulo y aviso', async () => {
  const { document: doc, t, captured } = await makeDom();
  incBtns(doc)[3].click();
  [...doc.querySelectorAll('#llanteraModos button')][1].click();
  await t.searchShops();
  assert.ok(doc.getElementById('resSub').textContent.includes('la llantera más cercana'));
  t.setUser({ id: 9, email: 'prueba@test.mx' });
  await t.notifyShop(0);
  assert.equal(captured.notify.descripcion, 'Necesito la llantera más cercana');
});

test('Choqué sigue con sus 3 modos y URGENTE solo en el lugar del percance', async () => {
  const { document: doc, t } = await makeDom();
  incBtns(doc)[0].click();
  assert.ok(active(doc, 'p-choque-modo'));
  const modos = [...doc.querySelectorAll('#choqueModos button')];
  assert.equal(modos.length, 3);
  assert.ok(modos[0].textContent.includes('URGENTE'));
  assert.ok(!modos[1].textContent.includes('URGENTE'));
  assert.ok(!modos[2].textContent.includes('URGENTE'));
  modos[2].click(); // a domicilio
  await t.searchShops();
  assert.ok(doc.getElementById('resSub').textContent.includes('a domicilio'));
  assert.ok(doc.getElementById('resList').textContent.includes('$300'));
});
