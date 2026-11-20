// Carrusel del inicio: 3 imágenes con frase que cambian solas.
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

async function makeDom() {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  window.fetch = globalThis.fetch;
  window.eval(appJs);
  await new Promise(r => setTimeout(r, 50));
  wins.push(window);
  return { window, document: window.document };
}

test('el inicio tiene 3 imágenes con sus 3 frases y 3 puntitos', async () => {
  const { document: doc } = await makeDom();
  const slides = [...doc.querySelectorAll('#carruselTrack .carrusel-slide')];
  assert.equal(slides.length, 3);
  assert.ok(slides[0].querySelector('img').src.includes('/carrusel-1.jpg'));
  assert.ok(slides[0].textContent.includes('Asistencia para tu vehículo'));
  assert.ok(slides[1].querySelector('img').src.includes('/carrusel-2.jpg'));
  assert.ok(slides[1].textContent.includes('Te asisten profesionales'));
  assert.ok(slides[2].querySelector('img').src.includes('/carrusel-3.jpg'));
  assert.ok(slides[2].textContent.includes('La mejor opción para tu vehículo'));
  assert.equal(doc.querySelectorAll('#carruselPuntos button').length, 3);
  // La primera imagen está activa al cargar (el -0% se lee como 0%).
  assert.equal(doc.getElementById('carruselTrack').style.transform, 'translateX(0%)');
  assert.ok(doc.querySelectorAll('#carruselPuntos button')[0].classList.contains('sel'));
});

test('picar un puntito cambia la imagen', async () => {
  const { document: doc } = await makeDom();
  doc.querySelectorAll('#carruselPuntos button')[2].click();
  assert.equal(doc.getElementById('carruselTrack').style.transform, 'translateX(-200%)');
  assert.ok(doc.querySelectorAll('#carruselPuntos button')[2].classList.contains('sel'));
  assert.ok(!doc.querySelectorAll('#carruselPuntos button')[0].classList.contains('sel'));
});

test('las 3 imágenes existen en public/', async () => {
  for (const f of ['carrusel-1.jpg', 'carrusel-2.jpg', 'carrusel-3.jpg']) {
    assert.ok(fs.existsSync(path.join(DIR, f)), 'falta ' + f);
    assert.ok(fs.statSync(path.join(DIR, f)).size > 50000, f + ' muy chica');
  }
});
