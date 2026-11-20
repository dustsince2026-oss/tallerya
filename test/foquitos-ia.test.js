// Foquitos con IA: al tomar la foto del tablero, Gemini marca solos
// los foquitos prendidos. La foto no se guarda; si la lectura no está
// activada (sin llave) o falla, queda la lista manual de siempre.
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

const FOCOS = [
  { id: 'check', icono: '🔧', nombre: 'Check engine (motor)' },
  { id: 'bateria', icono: '🔋', nombre: 'Batería' },
  { id: 'aceite', icono: '🛢️', nombre: 'Presión de aceite' },
  { id: 'temp', icono: '🌡️', nombre: 'Temperatura' },
  { id: 'frenos', icono: '🛑', nombre: 'Frenos' },
  { id: 'abs', icono: 'ⓐ', nombre: 'ABS' },
  { id: 'airbag', icono: '💺', nombre: 'Bolsa de aire' },
  { id: 'llanta', icono: '🛞', nombre: 'Presión de llantas' },
  { id: 'direccion', icono: '🎛️', nombre: 'Dirección' },
  { id: 'gas', icono: '⛽', nombre: 'Gasolina' },
];
const SIGNIFICADOS = {
  aceite: { id: 'aceite', icono: '🛢️', nombre: 'Presión de aceite', significa: 'Peligro de motor.', urgencia: '¡No sigas manejando!', espLabel: 'mecánico' },
  bateria: { id: 'bateria', icono: '🔋', nombre: 'Batería', significa: 'No está cargando.', urgencia: 'Revisa pronto', espLabel: 'eléctrico' },
  temp: { id: 'temp', icono: '🌡️', nombre: 'Temperatura', significa: 'Se está calentando.', urgencia: '¡No sigas manejando!', espLabel: 'mecánico' },
};

let leerRespuesta = { ok: true, focos: ['aceite', 'bateria'] };

async function makeDom() {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const fetchStub = async (url, opts) => {
    const u = String(url);
    if (u.includes('/api/focos-leer-foto')) return { ok: true, status: 200, json: async () => leerRespuesta };
    if (u.includes('/api/focos-diagnostico')) {
      const ids = JSON.parse(opts.body).focos;
      return { ok: true, status: 200, json: async () => ({ focos: ids.map(id => SIGNIFICADOS[id]).filter(Boolean), especialistas: [{ tipo: 'mecanico', label: 'mecánico' }] }) };
    }
    if (u.includes('/api/focos')) return { ok: true, status: 200, json: async () => ({ focos: FOCOS }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  globalThis.fetch = fetchStub;
  window.fetch = fetchStub;
  window.eval(appJs + '\n;window.__test = { loadFocos, mostrarFocos, leerFotoTablero, mostrarSignificados, focosSel: () => focosSel };');
  await window.__test.loadFocos();
  window.__test.mostrarFocos();
  wins.push(window);
  return { window, document: window.document, t: window.__test };
}

function checkedIds(doc) {
  return [...doc.querySelectorAll('#focosList input[type="checkbox"]')]
    .filter(cb => cb.checked).map(cb => cb.dataset.foco).sort();
}

test('la IA marca solos los foquitos prendidos y avisa que revise', async () => {
  leerRespuesta = { ok: true, focos: ['aceite', 'bateria'] };
  const { document: doc, t } = await makeDom();
  await t.leerFotoTablero('data:image/jpeg;base64,/9j/4AAQ');
  assert.deepEqual(checkedIds(doc), ['aceite', 'bateria']);
  assert.deepEqual(Object.keys(t.focosSel()).sort(), ['aceite', 'bateria']);
  assert.ok(doc.getElementById('fotoIALine').textContent.includes('Revisa y corrige'));
});

test('si la IA no ve ninguno prendido, no marca nada y lo dice', async () => {
  leerRespuesta = { ok: true, focos: [] };
  const { document: doc, t } = await makeDom();
  await t.leerFotoTablero('data:image/jpeg;base64,/9j/4AAQ');
  assert.deepEqual(checkedIds(doc), []);
  assert.ok(doc.getElementById('fotoIALine').textContent.includes('No se ve ningún foquito'));
});

test('sin llave (no-key) queda la lista manual y lo dice', async () => {
  leerRespuesta = { ok: false, reason: 'no-key' };
  const { document: doc, t } = await makeDom();
  await t.leerFotoTablero('data:image/jpeg;base64,/9j/4AAQ');
  assert.deepEqual(checkedIds(doc), []);
  assert.ok(doc.getElementById('fotoIALine').textContent.includes('no está activada'));
});

test('después de marcar, Ver qué significa muestra los significados', async () => {
  leerRespuesta = { ok: true, focos: ['aceite', 'bateria'] };
  const { document: doc, t } = await makeDom();
  await t.leerFotoTablero('data:image/jpeg;base64,/9j/4AAQ');
  await t.mostrarSignificados();
  const txt = doc.getElementById('focoResultado').textContent;
  assert.ok(txt.includes('Presión de aceite'));
  assert.ok(txt.includes('¡No sigas manejando!'));
  assert.ok(txt.includes('Batería'));
});

test('una segunda foto limpia lo marcado antes', async () => {
  leerRespuesta = { ok: true, focos: ['aceite', 'bateria'] };
  const { document: doc, t } = await makeDom();
  await t.leerFotoTablero('data:image/jpeg;base64,/9j/4AAQ');
  assert.deepEqual(checkedIds(doc), ['aceite', 'bateria']);
  leerRespuesta = { ok: true, focos: ['temp'] };
  await t.leerFotoTablero('data:image/jpeg;base64,/9j/4AAQ');
  assert.deepEqual(checkedIds(doc), ['temp']);
});

test('tomar la foto dispara la lectura sola y marca los foquitos', async () => {
  leerRespuesta = { ok: true, focos: ['aceite'] };
  const { window, document: doc } = await makeDom();
  const file = new window.File([new Uint8Array([255, 216, 255, 224])], 'tablero.jpg', { type: 'image/jpeg' });
  const input = doc.getElementById('fotoTableroInput');
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 300));
  assert.ok(doc.getElementById('fotoTableroPreview').style.display !== 'none');
  assert.deepEqual(checkedIds(doc), ['aceite']);
});

// ---------- Backend: POST /api/focos-leer-foto ----------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tallerya-focos-ia-'));
process.env.TALLERYA_DATA_DIR = TMP;
process.env.AUTH_SECRET = 'test-secret-tallerya';
process.env.OWNER_EMAIL = 'dueno@tallerya.mx';
const { dispatch } = require('../api/_lib/handlers');

function geminiOk(texto) {
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
}
async function expectErr(p, status) {
  let e = null;
  try { await p; } catch (err) { e = err; }
  assert.ok(e, 'debió fallar');
  assert.equal(e.status, status);
}

test('backend: devuelve solo ids de la lista conocida (filtra inventados)', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () => geminiOk('{"focos": ["aceite", "bateria", "inventado", "aceite"]}');
  const r = await dispatch('focos-leer-foto', { body: { dataBase64: Buffer.from('foto').toString('base64'), mimeType: 'image/jpeg' }, query: {}, token: null });
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.focos, ['aceite', 'bateria']);
});

test('backend: sin llave devuelve no-key (la pantalla usa la lista manual)', async () => {
  delete process.env.GEMINI_API_KEY;
  const r = await dispatch('focos-leer-foto', { body: { dataBase64: Buffer.from('foto').toString('base64') }, query: {}, token: null });
  assert.deepEqual(r.data, { ok: false, reason: 'no-key' });
});

test('backend: sin foto y con foto muy pesada da 400', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  await expectErr(dispatch('focos-leer-foto', { body: {}, query: {}, token: null }), 400);
  const grande = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
  await expectErr(dispatch('focos-leer-foto', { body: { dataBase64: grande }, query: {}, token: null }), 400);
});

test('backend: si Gemini se satura devuelve ia-error sin romper', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'overloaded' } }) });
  const r = await dispatch('focos-leer-foto', { body: { dataBase64: Buffer.from('foto').toString('base64') }, query: {}, token: null });
  assert.equal(r.data.ok, false);
  assert.equal(r.data.reason, 'ia-error');
});
