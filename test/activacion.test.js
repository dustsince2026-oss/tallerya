'use strict';
// Activación de talleres (corrección de Orlan 2026-11-19): el taller se
// registra solo y queda EN ESPERA hasta que Orlan va en persona a
// verificarlo y le entrega el código; con el código el taller ACTIVA
// su cuenta. El código también se puede meter directo al registrarse
// (atajo). El taller en espera ve el aviso de la visita con el campo
// para meter su código, y el dueño ve la lista de talleres en espera.
// Se prueba contra el adaptador de archivo local (sin Supabase).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tallerya-activacion-test-'));
process.env.TALLERYA_DATA_DIR = TMP;
process.env.AUTH_SECRET = 'test-secret-tallerya';
process.env.OWNER_EMAIL = 'dueno@tallerya.mx';

const { dispatch } = require('../api/_lib/handlers');

async function call(route, body, token) {
  return dispatch(route, { body: body || {}, query: {}, token: token || null });
}
async function callQ(route, query, token) {
  return dispatch(route, { body: {}, query: query || {}, token: token || null });
}
async function expectErr(promise, status) {
  try {
    await promise;
  } catch (e) {
    assert.equal(e.status, status, 'esperaba error ' + status + ', llegó ' + e.status + ': ' + e.message);
    return e;
  }
  assert.fail('esperaba error ' + status + ' y no falló');
}

let ownerToken, driverToken, workshopToken;

test('el dueño y un conductor se registran (sin código)', async () => {
  const o = await call('register', { name: 'Orlan', email: 'dueno@tallerya.mx', password: 'secreto1', role: 'driver' });
  assert.equal(o.data.user.isOwner, true);
  ownerToken = o.data.token;
  const d = await call('register', { name: 'Daniel', email: 'daniel@ejemplo.mx', password: 'secreto1', role: 'driver' });
  assert.equal(d.data.user.role, 'driver');
  driverToken = d.data.token;
});

test('taller sin código: se registra, queda en espera y no aparece en búsquedas', async () => {
  const r = await call('register', {
    name: 'El Faro', email: 'faro@taller.mx', password: 'secreto1', role: 'workshop',
    phone: '646 111 2233', tallerNombre: 'Hojalatería y Pintura El Faro',
    especialidad: 'Hojalatería y pintura', zona: 'Valle Verde, Ensenada',
    whatsapp: '646 111 2233', plan: 'Destacado',
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.approved, false, 'sin código queda en espera');
  workshopToken = r.data.token;

  // En espera no aparece en los resultados ni en su propia ficha.
  const s = await callQ('search', { incident: 'choque' });
  assert.equal(s.data.shops.length, 0, 'en espera no aparece');
  await expectErr(callQ('get-shop', { source: 'app', id: r.data.workshop.id }), 404);

  // El panel sí le dice que está en espera (aprobado=false).
  const panel = await call('get-panel', {}, workshopToken);
  assert.equal(panel.data.taller.aprobado, false);
});

test('lista de talleres en espera: solo el dueño la ve', async () => {
  const list = await call('pending-workshops-list', {}, ownerToken);
  assert.equal(list.data.pendientes.length, 1);
  assert.equal(list.data.pendientes[0].nombre, 'Hojalatería y Pintura El Faro');
  assert.equal(list.data.pendientes[0].contacto, 'El Faro');
  assert.equal(list.data.pendientes[0].email, 'faro@taller.mx');
  assert.equal(list.data.pendientes[0].telefono, '646 111 2233');
  assert.ok(list.data.pendientes[0].registrado, 'lleva la fecha de registro');

  // Un conductor no la puede ver; sin sesión tampoco.
  await expectErr(call('pending-workshops-list', {}, driverToken), 403);
  await expectErr(call('pending-workshops-list', {}), 401);
  // Un taller tampoco (ni siquiera su propia lista).
  await expectErr(call('pending-workshops-list', {}, workshopToken), 403);
});

test('activar: sin código, con código desconocido y con código ya usado → 400', async () => {
  const vacio = await expectErr(call('activate-workshop', {}, workshopToken), 400);
  assert.match(vacio.message, /código no es válido/);
  const malo = await expectErr(call('activate-workshop', { inviteCode: 'TALLER-ZZZZZZ' }, workshopToken), 400);
  assert.match(malo.message, /código no es válido/);

  // El conductor no puede activar (solo talleres); sin sesión tampoco.
  const c = await call('invite-code-create', { note: 'Para otro' }, ownerToken);
  await expectErr(call('activate-workshop', { inviteCode: c.data.codigo.code }, driverToken), 400);
  await expectErr(call('activate-workshop', { inviteCode: c.data.codigo.code }), 401);

  // Código ya usado por otro taller → 400.
  const r2 = await call('register', {
    name: 'Otro', email: 'otro@taller.mx', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Otro taller', especialidad: 'Mecánica', zona: 'Centro',
    whatsapp: '646 999 8888', plan: 'Basico', inviteCode: c.data.codigo.code,
  });
  assert.equal(r2.data.user.approved, true, 'el otro taller entró aprobado con el código (atajo)');
  await expectErr(call('activate-workshop', { inviteCode: c.data.codigo.code }, workshopToken), 400);
});

test('activar con código válido: el taller queda activo y aparece en búsquedas', async () => {
  const c = await call('invite-code-create', { note: 'Hojalatería El Faro' }, ownerToken);
  const code = c.data.codigo.code;

  // El código se puede meter en minúsculas: se normaliza.
  const act = await call('activate-workshop', { inviteCode: code.toLowerCase() }, workshopToken);
  assert.equal(act.status, 200);
  assert.equal(act.data.user.approved, true);
  assert.equal(act.data.workshop.nombre, 'Hojalatería y Pintura El Faro');

  // Ya activo: aparece en los resultados y en su ficha.
  const s = await callQ('search', { incident: 'choque' });
  assert.equal(s.data.shops.length, 1);
  assert.equal(s.data.shops[0].nombre, 'Hojalatería y Pintura El Faro');
  const ficha = await callQ('get-shop', { source: 'app', id: s.data.shops[0].id });
  assert.equal(ficha.data.shop.nombre, 'Hojalatería y Pintura El Faro');
  const panel = await call('get-panel', {}, workshopToken);
  assert.equal(panel.data.taller.aprobado, true);

  // Ya no sale en la lista de espera del dueño.
  const list = await call('pending-workshops-list', {}, ownerToken);
  assert.equal(list.data.pendientes.length, 0, 'activado ya no está en espera');

  // El código quedó usado: sale así en la lista de códigos.
  const codigos = await call('invite-codes-list', {}, ownerToken);
  const usado = codigos.data.codigos.find(x => x.code === code);
  assert.equal(usado.usado, true);
  assert.equal(usado.usedByName, 'El Faro');

  // Un taller ya activo no se puede activar otra vez.
  const otra = await expectErr(call('activate-workshop', { inviteCode: code }, workshopToken), 400);
  assert.match(otra.message, /ya está activo/);
});

test('el aviso de la visita sale en la pantalla de espera', async () => {
  // Chequeo estático del frente: el texto de Orlan y el campo para
  // meter el código están en la pantalla de espera del panel.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('Tu cuenta está en espera de verificación.'), 'falta el título de espera');
  assert.ok(html.includes('En los próximos días llegará un agente de TallerYa a visitarte para corroborar la información que nos mostraste y entregarte el código para que tu registro sea exitoso.'), 'falta el aviso de Orlan');
  assert.ok(html.includes('id="activarCodigo"'), 'falta el campo para meter el código');
  assert.ok(html.includes('Activar mi taller'), 'falta el botón de activar');
  assert.ok(html.includes('Talleres en espera'), 'falta la lista de espera del dueño');
  // Y ya no dice que el taller está "desactivado por el dueño".
  assert.ok(!html.includes('desactivado por el dueño'), 'sigue el texto viejo de desactivado');
});
