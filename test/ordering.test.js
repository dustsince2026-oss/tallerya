'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { orderShops, haversineKm, tiposDeEspecialidad, shopMatchesTipo } = require('../api/_lib/handlers');

test('haversine: distancia Ensenada centro → Valle Verde ≈ 1-2 km', () => {
  const d = haversineKm(31.8640, -116.6130, 31.8571, -116.6050);
  assert.ok(d > 0.5 && d < 3, 'distancia ' + d);
  assert.equal(haversineKm(31.86, -116.6, 31.86, -116.6), 0);
});

test('tipos de especialidad del formulario', () => {
  assert.deepEqual(tiposDeEspecialidad('Hojalatería y pintura'), ['hojalateria']);
  assert.deepEqual(tiposDeEspecialidad('Carrocería/hojalatería y pintura'), ['hojalateria']);
  assert.deepEqual(tiposDeEspecialidad('Mecánica'), ['mecanico', 'electrico']);
  assert.deepEqual(tiposDeEspecialidad('Eléctrico automotriz'), ['electrico']);
  assert.deepEqual(tiposDeEspecialidad('Grúas'), ['grua']);
  assert.deepEqual(tiposDeEspecialidad('Llantera'), ['llantera']);
  assert.deepEqual(tiposDeEspecialidad('Varias'), ['hojalateria', 'mecanico', 'electrico', 'grua', 'llantera']);
});

test('orden: talleres con la app primero, por plan, luego calificación, luego distancia', () => {
  const app = [
    { nombre: 'Básico lejos', plan: 'Basico', rating: 5.0, distKm: 0.5 },
    { nombre: 'Premium lejos', plan: 'Premium', rating: 4.0, distKm: 9 },
    { nombre: 'Destacado cerca', plan: 'Destacado', rating: 4.9, distKm: 0.3 },
    { nombre: 'Destacado mejor rating', plan: 'Destacado', rating: 5.0, distKm: 5 },
  ];
  const google = [
    { nombre: 'Google cerquísima', plan: 'Básico', rating: 5.0, distKm: 0.1 },
  ];
  const out = orderShops(app, google, null, null).map(s => s.nombre);
  assert.deepEqual(out, [
    'Premium lejos',           // plan manda, aunque esté lejos
    'Destacado mejor rating',  // mismo plan: mejor rating primero
    'Destacado cerca',
    'Básico lejos',
    'Google cerquísima',       // Google siempre después, aunque esté cerca
  ]);
});

test('orden: 10 talleres con la app salen antes que el 11.º de Google', () => {
  const app = Array.from({ length: 10 }, (_, i) => ({ nombre: 'App' + i, plan: 'Basico', rating: 4.5, distKm: 1 + i }));
  const google = [{ nombre: 'Google1', plan: 'Básico', rating: 5.0, distKm: 0.1 }];
  const out = orderShops(app, google, null, null);
  assert.equal(out.length, 11);
  assert.equal(out[10].nombre, 'Google1');
  assert.ok(out.slice(0, 10).every(s => s.nombre.startsWith('App')));
});

test('orden: con GPS la distancia se calcula real (haversine)', () => {
  const app = [
    { nombre: 'Lejos en semilla', plan: 'Basico', rating: 4.5, distKm: 0.1, lat: 31.80, lng: -116.55 },
    { nombre: 'Cerca en GPS', plan: 'Basico', rating: 4.5, distKm: 9, lat: 31.8641, lng: -116.6131 },
  ];
  const out = orderShops(app, [], 31.8640, -116.6130);
  assert.equal(out[0].nombre, 'Cerca en GPS');
  assert.ok(out[0].distKm < 0.1);
});

test('filtro por tipo de incidente', () => {
  assert.equal(shopMatchesTipo({ tipo: 'hojalateria' }, ['hojalateria']), true);
  assert.equal(shopMatchesTipo({ tipo: 'mecanico' }, ['hojalateria']), false);
  // 'noarranca' acepta mecánico o eléctrico
  assert.equal(shopMatchesTipo({ tipo: 'electrico' }, ['mecanico', 'electrico']), true);
  // taller 'Varias' atiende todo
  assert.equal(shopMatchesTipo({ especialidad: 'Varias' }, ['grua']), true);
});
