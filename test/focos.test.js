'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FOCOS, specialistForFocos } = require('../api/_lib/focos');

test('la lista de foquitos tiene los 10 del prototipo', () => {
  assert.equal(FOCOS.length, 10);
  const ids = FOCOS.map(f => f.id);
  for (const id of ['check', 'bateria', 'aceite', 'temp', 'frenos', 'abs', 'airbag', 'llanta', 'direccion', 'gas']) {
    assert.ok(ids.includes(id), 'falta ' + id);
  }
});

test('aceite y temperatura son "¡No sigas manejando!"', () => {
  const aceite = FOCOS.find(f => f.id === 'aceite');
  const temp = FOCOS.find(f => f.id === 'temp');
  assert.equal(aceite.urgencia, '¡No sigas manejando!');
  assert.equal(temp.urgencia, '¡No sigas manejando!');
  assert.equal(aceite.esp, 'mecanico');
});

test('diagnóstico: aceite + batería recomienda mecánico y eléctrico', () => {
  const r = specialistForFocos(['aceite', 'bateria']);
  assert.equal(r.focos.length, 2);
  assert.deepEqual(r.especialistas.map(e => e.tipo).sort(), ['electrico', 'mecanico']);
});

test('diagnóstico: gasolina no recomienda taller', () => {
  const r = specialistForFocos(['gas']);
  assert.equal(r.focos.length, 1);
  assert.deepEqual(r.especialistas, []);
});

test('diagnóstico: ids desconocidos se ignoran', () => {
  const r = specialistForFocos(['no-existe']);
  assert.deepEqual(r.focos, []);
  assert.deepEqual(r.especialistas, []);
});
