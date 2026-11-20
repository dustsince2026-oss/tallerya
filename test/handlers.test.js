'use strict';
// Flujo completo contra el adaptador de archivo local (sin Supabase).
// IMPORTANTE: las variables de entorno van ANTES del require: store.js
// lee TALLERYA_DATA_DIR al cargarse.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tallerya-test-'));
process.env.TALLERYA_DATA_DIR = TMP;
process.env.AUTH_SECRET = 'test-secret-tallerya';
process.env.OWNER_EMAIL = 'dueno@tallerya.mx';

const { dispatch } = require('../api/_lib/handlers');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

let driverToken, driverId, workshopToken, workshopUserId, workshopId, ownerToken;

test('registro de conductor + login + duplicados', async () => {
  const r = await call('register', { name: 'Daniel', email: 'daniel@ejemplo.mx', password: 'secreto1', role: 'driver', phone: '646 111 2222' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.role, 'driver');
  assert.ok(r.data.token);
  driverToken = r.data.token; driverId = r.data.user.id;

  await expectErr(call('register', { name: 'Otro', email: 'daniel@ejemplo.mx', password: 'secreto1' }), 400);
  await expectErr(call('register', { name: 'X', email: 'mal-correo', password: 'secreto1' }), 400);
  await expectErr(call('register', { name: 'X', email: 'x@ejemplo.mx', password: '123' }), 400);

  const bad = await expectErr(call('login', { email: 'daniel@ejemplo.mx', password: 'mal' }), 401);
  assert.match(bad.message, /incorrectos/);
  const ok = await call('login', { email: 'daniel@ejemplo.mx', password: 'secreto1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.id, driverId);
});

test('perfil del conductor: máximo 3 carros', async () => {
  const cuatro = [
    { marca: 'Nissan', modelo: 'Versa', anio: '2019', color: 'Blanco' },
    { marca: 'Toyota', modelo: 'Corolla', anio: '2021', color: 'Gris' },
    { marca: 'Honda', modelo: 'Civic', anio: '2018', color: 'Rojo' },
    { marca: 'Kia', modelo: 'Rio', anio: '2020', color: 'Azul' },
  ];
  await expectErr(call('save-driver-profile', { carros: cuatro }, driverToken), 400);
  await expectErr(call('save-driver-profile', { carros: [{ modelo: 'Versa' }] }, driverToken), 400);
  const tres = cuatro.slice(0, 3);
  const saved = await call('save-driver-profile', {
    carros: tres, tieneSeguro: true, aseguradora: 'Quálitas', poliza: 'Q123', telAseg: '800 800 8000',
  }, driverToken);
  assert.equal(saved.data.profile.carros.length, 3);
  assert.equal(saved.data.profile.poliza, 'Q123');
  const got = await call('get-driver-profile', {}, driverToken);
  assert.equal(got.data.profile.carros[0].marca, 'Nissan');
  await expectErr(call('get-driver-profile', {}), 401);
});

async function inviteCode(note) {
  const r = await call('invite-code-create', { note: note || '' }, ownerToken);
  return r.data.codigo.code;
}

test('registro de taller: sin código queda en espera; con código se activa', async () => {
  // Primero el dueño (el correo del dueño es OWNER_EMAIL).
  const o = await call('register', { name: 'Orlan', email: 'dueno@tallerya.mx', password: 'secreto1', role: 'driver' });
  ownerToken = o.data.token;
  assert.equal(o.data.user.isOwner, true);

  const base = {
    name: 'El Faro', email: 'faro@taller.mx', password: 'secreto1', role: 'workshop',
    phone: '646 111 2233', tallerNombre: 'Hojalatería y Pintura El Faro',
    especialidad: 'Hojalatería y pintura', zona: 'Valle Verde, Ensenada',
    whatsapp: '646 111 2233', tieneGrua: false, aDomicilio: true, plan: 'Destacado',
  };
  // Sin código sí se registra, pero queda en espera y NO aparece en
  // los resultados. Sin llave de Google Places no hay talleres de
  // Google (ya no hay datos de ejemplo).
  const r0 = await call('register', { ...base });
  assert.equal(r0.status, 201);
  assert.equal(r0.data.user.approved, false, 'sin código queda en espera');
  workshopToken = r0.data.token; workshopUserId = r0.data.user.id; workshopId = r0.data.workshop.id;
  const s0 = await callQ('search', { incident: 'choque' });
  assert.equal(s0.data.shops.length, 0, 'en espera no aparece');
  assert.equal(s0.data.googleDisponible, false);

  // Con código desconocido no se puede registrar.
  await expectErr(call('register', { ...base, email: 'otro@taller.mx', inviteCode: 'TALLER-ZZZZZZ' }), 400);

  // Orlan lo visita y le entrega el código: el taller lo mete y se
  // activa en ese momento, y ya aparece en los resultados.
  const code = await inviteCode('Hojalatería El Faro');
  const act = await call('activate-workshop', { inviteCode: code }, workshopToken);
  assert.equal(act.status, 200);
  assert.equal(act.data.user.approved, true, 'con código el taller ya está verificado');
  assert.equal(act.data.workshop.nombre, 'Hojalatería y Pintura El Faro');

  const s2 = await callQ('search', { incident: 'choque' });
  assert.equal(s2.data.shops[0].source, 'app');
  assert.equal(s2.data.shops[0].nombre, 'Hojalatería y Pintura El Faro');
  assert.equal(s2.data.appCount, 1);
  assert.equal(s2.data.total, 1);
  assert.equal(s2.data.googleDisponible, false);

  // El código ya se usó: no sirve otra vez.
  await expectErr(call('register', { ...base, email: 'otro@taller.mx', inviteCode: code }), 400);

  // Un conductor no puede aprobar talleres.
  await expectErr(call('approve-workshop', { userId: workshopUserId, aprobado: false }, driverToken), 403);

  // Respaldo: el dueño sí puede quitarle y devolverle la aprobación.
  await call('approve-workshop', { userId: workshopUserId, aprobado: false }, ownerToken);
  const s3 = await callQ('search', { incident: 'choque' });
  assert.equal(s3.data.shops.length, 0, 'desaprobado no aparece');
  const ap = await call('approve-workshop', { userId: workshopUserId, aprobado: true }, ownerToken);
  assert.equal(ap.data.user.approved, true);
  const s4 = await callQ('search', { incident: 'choque' });
  assert.equal(s4.data.shops.length, 1, 'al volver a aprobar reaparece');
});

test('búsqueda por incidente: grúa habla de grúas, noarranca acepta eléctrico', async () => {
  // Sin llave de Google y sin grúas registradas: no hay resultados.
  const g0 = await callQ('search', { incident: 'grua' });
  assert.equal(g0.data.resTitle, 'Grúas cerca de ti');
  assert.equal(g0.data.shops.length, 0);
  assert.equal(g0.data.googleDisponible, false);

  // Registrar una grúa aprobada para probar el filtro (con código).
  const gr = await call('register', {
    name: 'Grúas', email: 'gruas@taller.mx', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Grúas El Faro', especialidad: 'Grúas y arrastre',
    zona: 'Toda la ciudad', whatsapp: '646 333 4455', plan: 'Basico',
    inviteCode: await inviteCode('Grúas El Faro'),
  });
  const g = await callQ('search', { incident: 'grua' });
  assert.equal(g.data.resTitle, 'Grúas cerca de ti');
  assert.ok(g.data.shops.length >= 1);
  assert.ok(g.data.shops.every(s => s.tipos.includes('grua')));

  // Registrar un eléctrico aprobado para probar el filtro noarranca (con código).
  const e = await call('register', {
    name: 'Volt', email: 'volt@taller.mx', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Eléctrico Automotriz Volt', especialidad: 'Eléctrico automotriz',
    zona: 'Valle Verde', whatsapp: '646 444 5566', plan: 'Destacado',
    inviteCode: await inviteCode('Eléctrico Volt'),
  });
  const n = await callQ('search', { incident: 'noarranca' });
  assert.ok(n.data.shops.some(s => s.nombre === 'Eléctrico Automotriz Volt'), 'noarranca incluye eléctricos');
  assert.ok(n.data.shops.every(s => s.tipos.includes('mecanico') || s.tipos.includes('electrico')));
});

test('choqué y presupuesto son lo mismo: un solo botón, alias en el servidor', async () => {
  // El botón 'Presupuesto de hojalatería' se quitó de la app: si chocaste
  // necesitas el presupuesto del choque. El servidor sigue aceptando
  // incident=presupuesto como alias de choque, con el mismo texto.
  const c = await callQ('search', { incident: 'choque' });
  assert.equal(c.data.resTitle, 'Talleres de carrocería/hojalatería cerca de ti');
  assert.ok(c.data.shops.some(s => s.nombre === 'Hojalatería y Pintura El Faro'));
  const p = await callQ('search', { incident: 'presupuesto' });
  assert.equal(p.data.resTitle, 'Talleres de carrocería/hojalatería cerca de ti');
  assert.deepEqual(p.data.shops.map(s => s.id), c.data.shops.map(s => s.id));
});

test('llantera: botón nuevo en vez de Falla eléctrica', async () => {
  // 'Falla eléctrica' repetía lo que ya cubre 'No arranca' (mecánico o
  // eléctrico), así que el botón ahora es 'Llantera'. Lo eléctrico sigue
  // existiendo por dentro (foquito, noarranca).
  const l = await call('register', {
    name: 'Llantas', email: 'llantas@taller.mx', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Llantera El Faro', especialidad: 'Llantera',
    zona: 'Valle Verde', whatsapp: '646 555 6677', plan: 'Basico',
    inviteCode: await inviteCode('Llantera El Faro'),
  });
  assert.equal(l.status, 201);
  assert.equal(l.data.user.approved, true);
  const s = await callQ('search', { incident: 'llantera' });
  assert.equal(s.data.resTitle, 'Llanteras cerca de ti');
  assert.ok(s.data.shops.some(x => x.nombre === 'Llantera El Faro'));
  assert.ok(s.data.shops.every(x => x.tipos.includes('llantera')));
});

test('costo por la visita: el taller pone su precio y sale en la búsqueda', async () => {
  // El costo aplica a los dos presupuestos fuera del taller (en el lugar
  // del percance y a domicilio); lo pone cada taller en su panel y cubre
  // servicio, tiempo y traslado. Llevar el carro al taller no lleva costo.
  const r = await call('register', {
    name: 'Faro2', email: 'faro2@taller.mx', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Hojalatería El Faro 2', especialidad: 'Carrocería/hojalatería y pintura',
    zona: 'Valle Verde', whatsapp: '646 111 2233', plan: 'Basico',
    inviteCode: await inviteCode('Faro 2'),
  });
  assert.equal(r.status, 201);
  const tok = r.data.token;
  const saved = await call('update-workshop-profile', { costoVisita: 300 }, tok);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.taller.costoVisita, 300);
  const s = await callQ('search', { incident: 'choque' });
  const shop = s.data.shops.find(x => x.nombre === 'Hojalatería El Faro 2');
  assert.ok(shop);
  assert.equal(shop.costoVisita, 300);
  // Vacío = a convenir (null).
  await call('update-workshop-profile', { costoVisita: '' }, tok);
  const s2 = await callQ('search', { incident: 'choque' });
  assert.equal(s2.data.shops.find(x => x.nombre === 'Hojalatería El Faro 2').costoVisita, null);
  // Pausar el taller de prueba para no contaminar los tests que siguen.
  await call('set-paused', { pausado: true }, tok);
});

test('la búsqueda trae las coordenadas del taller cuando las tiene (para el mapa)', async () => {
  // El taller guarda su ubicación en su panel; sin coordenadas no hay
  // pin en el mapa. El servidor nunca inventa coordenadas.
  const antes = await callQ('search', { incident: 'choque' });
  const faroAntes = antes.data.shops.find(s => s.nombre === 'Hojalatería y Pintura El Faro');
  assert.ok(faroAntes, 'el taller aparece');
  assert.equal(faroAntes.lat, null);
  assert.equal(faroAntes.lng, null);
  await call('update-workshop-profile', { lat: 31.8641, lng: -116.6131 }, workshopToken);
  const s = await callQ('search', { incident: 'choque' });
  const faro = s.data.shops.find(x => x.nombre === 'Hojalatería y Pintura El Faro');
  assert.ok(faro);
  assert.equal(faro.lat, 31.8641);
  assert.equal(faro.lng, -116.6131);
});

test('avisar al taller: crea solicitud + notificación + link de WhatsApp', async () => {
  const d = await call('notify', {
    workshopId, incident: 'choque', descripcion: 'Me pegaron en la defensa',
    carro: { marca: 'Nissan', modelo: 'Versa', anio: '2019', color: 'Blanco' },
  }, driverToken);
  assert.equal(d.status, 201);
  assert.equal(d.data.taller, 'Hojalatería y Pintura El Faro');
  assert.ok(d.data.whatsappUrl.startsWith('https://wa.me/526461112233?text='));
  assert.match(decodeURIComponent(d.data.whatsappUrl), /defensa/);

  // El taller lo ve en su panel y en su campanita.
  const panel = await call('get-panel', {}, workshopToken);
  assert.equal(panel.data.solicitudes.length, 1);
  assert.equal(panel.data.solicitudes[0].incidentLabel, 'Choqué');
  assert.equal(panel.data.solicitudes[0].driverName, 'Daniel');
  assert.equal(panel.data.solicitudes[0].carro.marca, 'Nissan');
  assert.equal(panel.data.unread, 1);
  const notifs = await call('list-notifications', {}, workshopToken);
  assert.match(notifs.data.notificaciones[0].titulo, /Nueva solicitud/);
  const read = await call('mark-notifications-read', {}, workshopToken);
  assert.equal(read.data.leidas, 1);

  // Avisar a un taller de Google no existe como taller con app → 404.
  await expectErr(call('notify', { workshopId: 99999, incident: 'choque' }, driverToken), 404);
  // Sin sesión no se puede avisar.
  await expectErr(call('notify', { workshopId, incident: 'choque' }), 401);
});

test('panel del taller: servicios, ofertas, perfil y pausa', async () => {
  const s = await call('set-services', { servicios: [
    { nombre: 'Hojalatería', precio: 'Desde $1,500' },
    { nombre: 'Pintura', precio: 'Desde $2,000' },
  ] }, workshopToken);
  assert.equal(s.data.servicios.length, 2);

  const o = await call('create-offer', { titulo: 'Pintura de defensa', precio: '$2,500', vigencia: 'Hasta el sábado' }, workshopToken);
  assert.equal(o.status, 201);
  const off = await call('set-offer-active', { offerId: o.data.oferta.id, activa: false }, workshopToken);
  assert.equal(off.data.oferta.activa, false);

  const p = await call('update-workshop-profile', { horario: '8:00 – 18:00', direccion: 'Calle Reforma 1234' }, workshopToken);
  assert.equal(p.data.taller.horario, '8:00 – 18:00');

  const stats = await call('get-panel', {}, workshopToken);
  assert.equal(stats.data.stats.avisos7d, 1, 'un aviso esta semana');

  // Pausar: el taller desaparece de los resultados (y sin llave no hay Google).
  await call('set-paused', { pausado: true }, workshopToken);
  const s2 = await callQ('search', { incident: 'choque' });
  assert.equal(s2.data.shops.length, 0, 'pausado no aparece');
  await call('set-paused', { pausado: false }, workshopToken);
  const s3 = await callQ('search', { incident: 'choque' });
  assert.equal(s3.data.shops[0].source, 'app', 'al volver aparece otra vez');

  // Un conductor no puede tocar el panel de un taller.
  await expectErr(call('get-panel', {}, driverToken), 403);
});

test('foto adjunta: solo la ven el conductor y el taller', async () => {
  const d = await call('notify', {
    workshopId, incident: 'otro', descripcion: 'Ruido raro',
    carro: { marca: 'Nissan', modelo: 'Versa', anio: '2019', color: 'Blanco' },
    fotoBase64: PNG_1PX,
  }, driverToken);
  assert.equal(d.status, 201);
  const panel = await call('get-panel', {}, workshopToken);
  const req = panel.data.solicitudes.find(x => x.descripcion === 'Ruido raro');
  assert.ok(req && req.fotoKey, 'la solicitud guarda la foto');

  // El conductor la puede ver (es suya).
  const fotoDriver = await dispatch('foto-file', { body: {}, query: { key: req.fotoKey }, token: driverToken });
  assert.equal(fotoDriver.status, 200);
  assert.ok(fotoDriver.file.bytes.length > 0);
  // El taller también.
  const fotoTaller = await dispatch('foto-file', { body: {}, query: { key: req.fotoKey }, token: workshopToken });
  assert.equal(fotoTaller.status, 200);
  // Un tercero no.
  const otro = await call('register', { name: 'Extraño', email: 'extrano@ejemplo.mx', password: 'secreto1', role: 'driver' });
  await expectErr(dispatch('foto-file', { body: {}, query: { key: req.fotoKey }, token: otro.data.token }), 403);
  // Foto muy pesada se rechaza.
  const grande = 'data:image/jpeg;base64,' + Buffer.alloc(3 * 1024 * 1024, 0).toString('base64');
  await expectErr(call('notify', { workshopId, incident: 'otro', fotoBase64: grande }, driverToken), 400);
});

test('foquitos: diagnóstico por API', async () => {
  const d = await call('diagnostico-focos', { focos: ['aceite', 'bateria'] });
  assert.equal(d.data.focos.length, 2);
  assert.deepEqual(d.data.especialistas.map(e => e.tipo).sort(), ['electrico', 'mecanico']);
  const f = await callQ('list-focos', {});
  assert.equal(f.data.focos.length, 10);
});

test('stats: vistas y llamadas se cuentan', async () => {
  await call('track-event', { workshopId, kind: 'vista' });
  await call('track-event', { workshopId, kind: 'vista' });
  await call('track-event', { workshopId, kind: 'llamada' });
  const panel = await call('get-panel', {}, workshopToken);
  assert.equal(panel.data.stats.vistas7d, 2);
  assert.equal(panel.data.stats.llamadas7d, 1);
  await expectErr(call('track-event', { workshopId: 99999, kind: 'vista' }), 404);
});
