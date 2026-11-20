'use strict';
// Códigos de invitación para talleres: solo entran talleres verificados
// por el dueño en persona. El dueño genera el código, lo entrega en el
// taller y el taller lo mete al registrarse. Sin código no hay registro
// de taller. El conductor no necesita código.
// Se prueba contra el adaptador de archivo local (sin Supabase).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tallerya-codigos-test-'));
process.env.TALLERYA_DATA_DIR = TMP;
process.env.AUTH_SECRET = 'test-secret-tallerya';
process.env.OWNER_EMAIL = 'dueno@tallerya.mx';

const { dispatch } = require('../api/_lib/handlers');

async function call(route, body, token) {
  try {
    return await dispatch(route, { body: body || {}, query: {}, token: token || null });
  } catch (e) {
    e._status = e.status;
    throw e;
  }
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

let ownerToken, driverToken;

test('el dueño se registra y genera un código', async () => {
  const o = await call('register', { name: 'Orlan', email: 'dueno@tallerya.mx', password: 'secreto1', role: 'driver' });
  assert.equal(o.data.user.isOwner, true);
  ownerToken = o.data.token;

  const c = await call('invite-code-create', { note: 'Hojalatería El Faro' }, ownerToken);
  assert.equal(c.status, 201);
  assert.match(c.data.codigo.code, /^TALLER-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(c.data.codigo.note, 'Hojalatería El Faro');
  assert.equal(c.data.codigo.usado, false);
});

test('registro de taller sin código → 400; con código desconocido → 400', async () => {
  const base = {
    name: 'El Faro', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Hojalatería y Pintura El Faro', especialidad: 'Hojalatería y pintura',
    zona: 'Valle Verde, Ensenada', whatsapp: '646 111 2233', plan: 'Destacado',
  };
  const sinCodigo = await expectErr(call('register', { ...base, email: 'faro1@taller.mx' }), 400);
  assert.match(sinCodigo.message, /código no es válido/);
  const malo = await expectErr(call('register', { ...base, email: 'faro2@taller.mx', inviteCode: 'TALLER-ZZZZZZ' }), 400);
  assert.match(malo.message, /código no es válido/);
  const vacio = await expectErr(call('register', { ...base, email: 'faro3@taller.mx', inviteCode: '   ' }), 400);
  assert.match(vacio.message, /código no es válido/);
});

test('con código válido el taller entra aprobado y aparece en búsquedas', async () => {
  const c = await call('invite-code-create', { note: 'Hojalatería El Faro' }, ownerToken);
  const code = c.data.codigo.code;

  // El código se puede meter en minúsculas: se normaliza.
  const r = await call('register', {
    name: 'El Faro', email: 'faro@taller.mx', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Hojalatería y Pintura El Faro', especialidad: 'Hojalatería y pintura',
    zona: 'Valle Verde, Ensenada', whatsapp: '646 111 2233', plan: 'Destacado',
    inviteCode: code.toLowerCase(),
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.approved, true, 'con código el taller ya está verificado');
  assert.equal(r.data.workshop.nombre, 'Hojalatería y Pintura El Faro');

  // Aparece en los resultados sin ningún paso extra de aprobación.
  const s = await callQ('search', { incident: 'choque' });
  assert.equal(s.data.shops.length, 1);
  assert.equal(s.data.shops[0].nombre, 'Hojalatería y Pintura El Faro');
  assert.equal(s.data.appCount, 1);

  // El código quedó usado: en la lista sale con quién lo usó.
  const list = await call('invite-codes-list', {}, ownerToken);
  const usado = list.data.codigos.find(x => x.code === code);
  assert.ok(usado, 'el código sigue en la lista');
  assert.equal(usado.usado, true);
  assert.equal(usado.usedByName, 'El Faro');
  assert.ok(usado.usedAt);

  // Reutilizar el mismo código → 400 con el mismo mensaje.
  const re = await expectErr(call('register', {
    name: 'Otro', email: 'otro@taller.mx', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Otro taller', inviteCode: code,
  }), 400);
  assert.match(re.message, /código no es válido/);
});

test('el conductor se registra sin código', async () => {
  const r = await call('register', { name: 'Daniel', email: 'daniel@ejemplo.mx', password: 'secreto1', role: 'driver' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.role, 'driver');
  driverToken = r.data.token;
});

test('códigos: solo el dueño puede crear, listar y desactivar', async () => {
  await expectErr(call('invite-code-create', { note: 'X' }, driverToken), 403);
  await expectErr(call('invite-codes-list', {}, driverToken), 403);
  await expectErr(call('invite-code-deactivate', { code: 'TALLER-ABCDEF' }, driverToken), 403);
  await expectErr(call('invite-code-create', { note: 'X' }), 401);
  await expectErr(call('invite-codes-list', {}), 401);
  await expectErr(call('invite-code-deactivate', { code: 'TALLER-ABCDEF' }), 401);
});

test('desactivar: código sin usar se quita; código usado no se puede desactivar', async () => {
  const c1 = await call('invite-code-create', { note: 'Para borrar' }, ownerToken);
  const c2 = await call('invite-code-create', { note: 'Para guardar' }, ownerToken);

  const d = await call('invite-code-deactivate', { code: c1.data.codigo.code }, ownerToken);
  assert.equal(d.data.ok, true);
  const list = await call('invite-codes-list', {}, ownerToken);
  assert.ok(!list.data.codigos.some(x => x.code === c1.data.codigo.code), 'el desactivado ya no sale');
  assert.ok(list.data.codigos.some(x => x.code === c2.data.codigo.code), 'el otro sigue');

  // Desactivar un código que no existe → 404.
  await expectErr(call('invite-code-deactivate', { code: 'TALLER-XXXXXX' }, ownerToken), 404);
  // Desactivar uno ya usado → 400.
  const usados = list.data.codigos.find(x => x.usado);
  assert.ok(usados, 'hay al menos un código usado');
  await expectErr(call('invite-code-deactivate', { code: usados.code }, ownerToken), 400);
});

test('el dueño puede quitarle la aprobación a un taller (respaldo)', async () => {
  // El taller de El Faro está aprobado; el dueño lo desaprueba y
  // desaparece de los resultados, y al volver a aprobarlo reaparece.
  const list = await call('invite-codes-list', {}, ownerToken);
  const usado = list.data.codigos.find(x => x.usado);
  const faroId = usado.usedBy;
  const off = await call('approve-workshop', { userId: faroId, aprobado: false }, ownerToken);
  assert.equal(off.data.user.approved, false);
  const s0 = await callQ('search', { incident: 'choque' });
  assert.equal(s0.data.shops.length, 0, 'desaprobado no aparece');
  const on = await call('approve-workshop', { userId: faroId, aprobado: true }, ownerToken);
  assert.equal(on.data.user.approved, true);
  const s1 = await callQ('search', { incident: 'choque' });
  assert.equal(s1.data.shops.length, 1, 'al volver a aprobar reaparece');
});
