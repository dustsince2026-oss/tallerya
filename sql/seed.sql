-- TallerYa — datos de ejemplo (DEMO, no reales).
-- Corre después de sql/schema.sql. Solo llena google_shops con los 3
-- talleres de ejemplo que aún no tienen la app (los mismos del prototipo).
-- Los 3 talleres CON la app (El Faro, Rivera, Volt) NO van aquí: se crean
-- registrándose en la app y aprobándolos el dueño.
insert into google_shops (nombre, especialidad, tipo, zona, direccion, telefono, rating, opiniones, horario, servicios, lat, lng, dist_km)
values
  ('Grúas Ensenada Express', 'Grúas y arrastre', 'grua', 'Toda la ciudad', 'Servicio móvil, toda Ensenada', '6463334455', 4.7, 64, '24 horas', 'Arrastre al taller o a tu casa, paso de corriente', 31.8490, -116.5960, 2.5),
  ('Hojalatería Los Pinos', 'Hojalatería y pintura', 'hojalateria', 'Los Pinos, Ensenada', 'Calle Pinos 12, Los Pinos', '6465556677', 4.6, 41, '8:00 – 18:00', 'Pintura, pulido, presupuestos', 31.8420, -116.6200, 3.4),
  ('Mecánica y Eléctrico del Puerto', 'Mecánica y eléctrico', 'mecanico', 'El Puerto, Ensenada', 'Calle del Puerto 321, El Puerto', '6466667788', 4.7, 93, '8:00 – 19:00', 'Mecánica general, eléctrico, escáner', 31.8680, -116.6250, 2.1)
on conflict do nothing;
