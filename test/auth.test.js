'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../api/_lib/auth');

test('contraseña: hash y verificación', () => {
  const h = hashPassword('secreto123');
  assert.notEqual(h, 'secreto123');
  assert.ok(verifyPassword('secreto123', h));
  assert.equal(verifyPassword('otra', h), false);
  assert.equal(verifyPassword('secreto123', 'basura'), false);
  assert.equal(verifyPassword('secreto123', null), false);
});

test('token de sesión: firma, verificación y manipulación', () => {
  const t = signToken(42);
  assert.equal(verifyToken(t), 42);
  // Un carácter cambiado invalida la firma.
  const roto = t.slice(0, -2) + (t.slice(-2) === 'AA' ? 'BB' : 'AA');
  assert.equal(verifyToken(roto), null);
  assert.equal(verifyToken(null), null);
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken('sin-punto'), null);
});
