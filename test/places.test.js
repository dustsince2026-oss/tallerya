'use strict';
// Google Places: mapeo, búsqueda, detalle y deduplicación.
// El fetch de Google se SIMULA en todos los tests (nunca se llama a la
// API real). Los talleres de ejemplo solo existen aquí, como fixtures
// de la respuesta falsa de Google — en el código de producción ya no
// hay datos de ejemplo.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tallerya-places-test-'));
process.env.TALLERYA_DATA_DIR = TMP;
process.env.AUTH_SECRET = 'test-secret-tallerya';
process.env.OWNER_EMAIL = 'dueno@tallerya.mx';

const { dispatch } = require('../api/_lib/handlers');
const { searchPlaces, getPlaceDetails, dedupePlaces, tipoForPlaces } = require('../api/_lib/places');

const FAKE_KEY = 'fake-google-places-key';

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

// ---- Fixtures: respuestas falsas de Google Places (API New) ----
function fakePlace(over = {}) {
  return {
    id: 'ChIJ111',
    displayName: { text: 'Taller Mecánico del Valle', languageCode: 'es' },
    formattedAddress: 'Av. Reforma 1234, Ensenada, B.C., México',
    rating: 4.8,
    userRatingCount: 132,
    internationalPhoneNumber: '+52 646 111 2233',
    location: { latitude: 31.8640, longitude: -116.6130 },
    types: ['car_repair'],
    businessStatus: 'OPERATIONAL',
    regularOpeningHours: {
      openNow: true,
      weekdayDescriptions: [
        'lunes: 8:00 a. m.–6:00 p. m.',
        'martes: 8:00 a. m.–6:00 p. m.',
        'miércoles: 8:00 a. m.–6:00 p. m.',
        'jueves: 8:00 a. m.–6:00 p. m.',
        'viernes: 8:00 a. m.–6:00 p. m.',
        'sábado: 9:00 a. m.–2:00 p. m.',
        'domingo: Cerrado',
      ],
    },
    ...over,
  };
}
function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}
function stubFetch(handler) {
  const prev = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = prev; };
}

test('places: mapeo de un lugar a la forma pública de Google', async () => {
  const fetchImpl = async (url, opts) => {
    assert.match(String(url), /places:searchText/);
    const body = JSON.parse(opts.body);
    assert.equal(body.textQuery, 'taller mecánico en Ensenada');
    assert.equal(body.languageCode, 'es');
    assert.equal(body.regionCode, 'MX');
    assert.equal(body.maxResultCount, 10);
    assert.equal(body.locationBias.circle.radius, 15000);
    assert.equal(body.locationBias.circle.center.latitude, 31.864);
    assert.equal(opts.headers['X-Goog-Api-Key'], FAKE_KEY);
    assert.ok(opts.headers['X-Goog-FieldMask'].includes('places.displayName'));
    return okJson({ places: [
      fakePlace(),
      // Cerrado permanente: no sale.
      fakePlace({ id: 'ChIJ222', displayName: { text: 'Hojalatería Cerrada' }, businessStatus: 'CLOSED_PERMANENTLY' }),
    ] });
  };
  const out = await searchPlaces({ tipo: 'mecanico', lat: 31.8640, lng: -116.6130, key: FAKE_KEY, fetchImpl });
  assert.equal(out.length, 1, 'el cerrado permanente no sale');
  const s = out[0];
  assert.equal(s.id, 'places:ChIJ111');
  assert.equal(s.source, 'google');
  assert.equal(s.enApp, false);
  assert.equal(s.nombre, 'Taller Mecánico del Valle');
  assert.equal(s.esp, 'Mecánica general');
  assert.deepEqual(s.tipos, ['mecanico']);
  assert.equal(s.tel, '6461112233', 'el teléfono queda local de 10 dígitos');
  assert.equal(s.rating, 4.8);
  assert.equal(s.opiniones, 132);
  assert.equal(s.plan, 'Básico');
  assert.equal(s.tieneGrua, false);
  assert.equal(s.aDomicilio, false);
  assert.deepEqual(s.ofertas, []);
  assert.equal(s.abierto, true);
  assert.ok(s.horario.length > 0, 'horario de hoy');
  assert.ok(s.distKm < 0.01, 'misma coordenada que el conductor: ' + s.distKm);
});

test('places: sin GPS la distancia es 0 y no se manda locationBias', async () => {
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.textQuery, 'grúas en Ensenada');
    assert.equal(body.locationBias, undefined);
    return okJson({ places: [fakePlace({ displayName: { text: 'Grúas del Pacífico' } })] });
  };
  const out = await searchPlaces({ tipo: 'grua', lat: null, lng: null, key: FAKE_KEY, fetchImpl });
  assert.equal(out.length, 1);
  assert.equal(out[0].distKm, 0);
  assert.equal(out[0].tieneGrua, true);
  assert.equal(out[0].esp, 'Grúas y arrastre');
  assert.deepEqual(out[0].tipos, ['grua']);
});

test('places: llantera pregunta por llanteras y marca la especialidad', async () => {
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.textQuery, 'llantera en Ensenada');
    return okJson({ places: [fakePlace({ displayName: { text: 'Llantera El Gallo' } })] });
  };
  const out = await searchPlaces({ tipo: 'llantera', lat: null, lng: null, key: FAKE_KEY, fetchImpl });
  assert.equal(out.length, 1);
  assert.equal(out[0].nombre, 'Llantera El Gallo');
  assert.equal(out[0].esp, 'Llantera');
  assert.deepEqual(out[0].tipos, ['llantera']);
});

test('places: lugar sin teléfono ni calificación no rompe el mapeo', async () => {
  const fetchImpl = async () => okJson({ places: [{
    id: 'ChIJ333',
    displayName: { text: 'Eléctrico Ramírez' },
    formattedAddress: 'Calle Falsa 123, Ensenada',
    location: { latitude: 31.85, longitude: -116.60 },
    types: ['car_repair'],
    businessStatus: 'OPERATIONAL',
  }] });
  const out = await searchPlaces({ tipo: 'electrico', lat: null, lng: null, key: FAKE_KEY, fetchImpl });
  assert.equal(out.length, 1);
  assert.equal(out[0].tel, '');
  assert.equal(out[0].rating, 0);
  assert.equal(out[0].opiniones, 0);
  assert.equal(out[0].abierto, true, 'sin horario se asume abierto');
  assert.equal(out[0].horario, '');
  assert.equal(out[0].esp, 'Eléctrico automotriz');
});

test('places: error de Google → lanza error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(
    searchPlaces({ tipo: 'mecanico', key: FAKE_KEY, fetchImpl }),
    /500/);
});

test('places: si tarda demasiado → error (con timeout corto en el test)', async () => {
  process.env.PLACES_TIMEOUT_MS = '50';
  try {
    await assert.rejects(
      searchPlaces({ tipo: 'mecanico', key: FAKE_KEY, fetchImpl: () => new Promise(() => {}) }),
      /tardó demasiado/);
  } finally {
    delete process.env.PLACES_TIMEOUT_MS;
  }
});

test('tipoForPlaces: un solo tipo se usa; varios usan el genérico', () => {
  assert.equal(tipoForPlaces(['hojalateria']), 'hojalateria');
  assert.equal(tipoForPlaces(['grua']), 'grua');
  assert.equal(tipoForPlaces(['mecanico', 'electrico']), 'mecanico');
  assert.equal(tipoForPlaces(['hojalateria', 'mecanico', 'electrico', 'grua']), 'mecanico');
  assert.equal(tipoForPlaces([]), 'mecanico');
});

test('dedupePlaces: mismo nombre cerca se quita; lejos no; sin coordenadas manda el nombre', () => {
  const app = [{ nombre: 'Taller Mecánico del Valle', lat: 31.8640, lng: -116.6130 }];
  const cerca = { nombre: 'Taller Mecanico del Valle', lat: 31.8641, lng: -116.6131 }; // sin acento, a ~14 m
  const lejos = { nombre: 'Taller Mecánico del Valle', lat: 31.80, lng: -116.55 }; // mismo nombre, a ~7 km
  const otro = { nombre: 'Otro Taller', lat: 31.8640, lng: -116.6130 };
  const sinCoords = { nombre: 'Taller Mecánico del Valle', lat: null, lng: null };
  assert.deepEqual(
    dedupePlaces([cerca, lejos, otro], app).map(s => s.nombre),
    ['Taller Mecánico del Valle', 'Otro Taller']);
  assert.equal(dedupePlaces([sinCoords], app).length, 0, 'mismo nombre sin coordenadas: es el mismo taller');
  assert.equal(dedupePlaces([otro], []).length, 1, 'sin talleres con app no se quita nada');
});

// ---- Búsqueda y detalle por API (dispatch), con el fetch simulado ----
let ownerToken, workshopId;

test('búsqueda con llave: talleres con la app primero, después Google real', async () => {
  const o = await call('register', { name: 'Orlan', email: 'dueno@tallerya.mx', password: 'secreto1', role: 'driver' });
  ownerToken = o.data.token;
  // El taller entra con código de invitación (verificado en persona) y
  // queda aprobado en ese momento, sin paso extra.
  const c = await call('invite-code-create', { note: 'Hojalatería El Faro' }, ownerToken);
  const w = await call('register', {
    name: 'El Faro', email: 'faro@taller.mx', password: 'secreto1', role: 'workshop',
    tallerNombre: 'Hojalatería y Pintura El Faro', especialidad: 'Hojalatería y pintura',
    zona: 'Valle Verde, Ensenada', whatsapp: '646 111 2233', plan: 'Destacado',
    inviteCode: c.data.codigo.code,
  });
  assert.equal(w.data.user.approved, true);
  workshopId = w.data.workshop.id;

  process.env.GOOGLE_PLACES_API_KEY = FAKE_KEY;
  const restore = stubFetch(async (url) => {
    assert.match(String(url), /places:searchText/);
    return okJson({ places: [
      fakePlace({ id: 'ChIJ900', displayName: { text: 'Hojalatería y Pintura San Marcos' } }),
      fakePlace({ id: 'ChIJ901', displayName: { text: 'Hojalatería La Palma' } }),
    ] });
  });
  try {
    const s = await callQ('search', { incident: 'choque' });
    assert.equal(s.data.googleDisponible, true);
    assert.equal(s.data.appCount, 1);
    assert.equal(s.data.total, 3);
    assert.equal(s.data.shops[0].source, 'app', 'la app va primero');
    assert.equal(s.data.shops[0].nombre, 'Hojalatería y Pintura El Faro');
    assert.ok(s.data.shops.slice(1).every(x => x.source === 'google'), 'después Google');
    assert.ok(s.data.shops.slice(1).every(x => x.id.startsWith('places:')));
    assert.equal(s.data.shops[1].nombre, 'Hojalatería y Pintura San Marcos');
  } finally {
    restore();
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});

test('búsqueda sin llave: solo app + googleDisponible false (nunca ejemplo)', async () => {
  delete process.env.GOOGLE_PLACES_API_KEY;
  const s = await callQ('search', { incident: 'choque' });
  assert.equal(s.data.googleDisponible, false);
  assert.equal(s.data.total, 1);
  assert.equal(s.data.shops[0].source, 'app');
});

test('búsqueda con llave pero Google falla: solo app + googleDisponible false', async () => {
  process.env.GOOGLE_PLACES_API_KEY = FAKE_KEY;
  const restore = stubFetch(async () => { throw new Error('red caída'); });
  try {
    const s = await callQ('search', { incident: 'choque' });
    assert.equal(s.data.googleDisponible, false);
    assert.equal(s.data.total, 1);
    assert.equal(s.data.shops[0].source, 'app');
  } finally {
    restore();
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});

test('búsqueda sin talleres y sin llave: 0 resultados', async () => {
  delete process.env.GOOGLE_PLACES_API_KEY;
  const s = await callQ('search', { incident: 'grua' });
  assert.equal(s.data.total, 0);
  assert.deepEqual(s.data.shops, []);
  assert.equal(s.data.googleDisponible, false);
});

test('deduplicación en la búsqueda: el taller con la app no se repite en Google', async () => {
  process.env.GOOGLE_PLACES_API_KEY = FAKE_KEY;
  const restore = stubFetch(async () => okJson({ places: [
    // Mismo nombre que el taller con la app (sin coordenadas en el
    // taller registrado): Google no debe repetirlo.
    fakePlace({ id: 'ChIJ910', displayName: { text: 'Hojalateria y Pintura El Faro' } }),
    fakePlace({ id: 'ChIJ911', displayName: { text: 'Hojalatería y Pintura San Marcos' } }),
  ] }));
  try {
    const s = await callQ('search', { incident: 'choque' });
    assert.equal(s.data.total, 2, '1 app + 1 Google (el duplicado se quitó)');
    assert.ok(!s.data.shops.some(x => x.source === 'google' && x.nombre === 'Hojalatería y Pintura El Faro'));
    assert.ok(s.data.shops.some(x => x.nombre === 'Hojalatería y Pintura San Marcos'));
  } finally {
    restore();
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});

test('límite: máximo 10 resultados de Google por búsqueda', async () => {
  process.env.GOOGLE_PLACES_API_KEY = FAKE_KEY;
  const places = Array.from({ length: 12 }, (_, i) => fakePlace({
    id: 'ChIJ' + (100 + i),
    displayName: { text: 'Hojalatería Número ' + (i + 1) },
  }));
  const restore = stubFetch(async () => okJson({ places }));
  try {
    const s = await callQ('search', { incident: 'choque' });
    assert.equal(s.data.shops.filter(x => x.source === 'google').length, 10);
    assert.equal(s.data.total, 11, '1 app + 10 Google');
  } finally {
    restore();
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});

test('get-shop de Google: detalle por Place Details', async () => {
  process.env.GOOGLE_PLACES_API_KEY = FAKE_KEY;
  const restore = stubFetch(async (url, opts) => {
    assert.match(String(url), /\/places\/ChIJ999/);
    assert.equal(opts.headers['X-Goog-Api-Key'], FAKE_KEY);
    return okJson(fakePlace({
      id: 'ChIJ999',
      displayName: { text: 'Hojalatería y Pintura San Marcos' },
    }));
  });
  try {
    const d = await callQ('get-shop', { source: 'google', id: 'places:ChIJ999', tipo: 'hojalateria' });
    assert.equal(d.data.shop.nombre, 'Hojalatería y Pintura San Marcos');
    assert.equal(d.data.shop.source, 'google');
    assert.equal(d.data.shop.enApp, false);
    assert.equal(d.data.shop.esp, 'Carrocería/hojalatería y pintura');
    assert.deepEqual(d.data.reviews, []);
  } finally {
    restore();
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});

test('get-shop de Google: sin llave, id que no es de Places, o lugar inexistente → 404', async () => {
  // Sin llave.
  delete process.env.GOOGLE_PLACES_API_KEY;
  const sinLlave = await expectErr(callQ('get-shop', { source: 'google', id: 'places:ChIJ999' }), 404);
  assert.match(sinLlave.message, /llave/);

  // Id que no es de Places (los numéricos de ejemplo ya no existen).
  await expectErr(callQ('get-shop', { source: 'google', id: '5' }), 404);

  // Con llave pero Google dice 404.
  process.env.GOOGLE_PLACES_API_KEY = FAKE_KEY;
  const restore = stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
  try {
    await expectErr(callQ('get-shop', { source: 'google', id: 'places:ChIJ000' }), 404);
  } finally {
    restore();
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});

test('getPlaceDetails directo: 404 de Google → null', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const shop = await getPlaceDetails('ChIJ000', { key: FAKE_KEY, fetchImpl });
  assert.equal(shop, null);
});
