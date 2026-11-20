'use strict';
// Talleres de ejemplo (DEMO, no reales) — los mismos 6 del prototipo v3
// aprobado por Orlan. 3 con la app (enApp: true) y 3 listados de Google
// (enApp: false). En producción los de Google se reemplazan por datos
// reales de Google Places; los de la app son talleres registrados.
// Coordenadas aproximadas en Ensenada, BC (para ordenar por distancia
// real con haversine cuando el conductor comparte su GPS).
const SEED_SHOPS = [
  {
    nombre: 'Hojalatería y Pintura El Faro', esp: 'Hojalatería y pintura', tipo: 'hojalateria', enApp: true,
    distKm: 1.2, lat: 31.8571, lng: -116.6050, abierto: true, horario: '8:00 – 18:00',
    rating: 4.9, opiniones: 87, plan: 'Premium', zona: 'Valle Verde, Ensenada',
    servicios: 'Hojalatería, pintura, presupuestos a domicilio',
    tel: '6461112233', dir: 'Calle Reforma 1234, Valle Verde',
    reviews: [['María G.', 'Me chocaron y vinieron a cotizar a mi casa el mismo día. Muy atentos.'], ['Luis R.', 'Pintura pareja, quedó como nuevo.']],
  },
  {
    nombre: 'Taller Mecánico Rivera', esp: 'Mecánica general', tipo: 'mecanico', enApp: true,
    distKm: 0.8, lat: 31.8640, lng: -116.6130, abierto: true, horario: '8:00 – 19:00',
    rating: 4.8, opiniones: 132, plan: 'Destacado', zona: 'Centro, Ensenada',
    servicios: 'Afinación, frenos, suspensión, cambio de aceite',
    tel: '6462223344', dir: 'Av. Juárez 456, Centro',
    reviews: [['Jorge P.', 'No arrancaba mi carro, llegaron en 30 minutos y lo dejaron jalando.'], ['Ana L.', 'Precio justo y te explican todo.']],
  },
  {
    nombre: 'Grúas Ensenada Express', esp: 'Grúas y arrastre', tipo: 'grua', enApp: false,
    distKm: 2.5, lat: 31.8490, lng: -116.5960, abierto: true, horario: '24 horas',
    rating: 4.7, opiniones: 64, plan: 'Básico', zona: 'Toda la ciudad',
    servicios: 'Arrastre al taller o a tu casa, paso de corriente',
    tel: '6463334455', dir: 'Servicio móvil, toda Ensenada',
    reviews: [['Carlos M.', 'Llegaron rápido en la noche, muy profesionales.']],
  },
  {
    nombre: 'Eléctrico Automotriz Volt', esp: 'Eléctrico automotriz', tipo: 'electrico', enApp: true,
    distKm: 1.9, lat: 31.8605, lng: -116.5990, abierto: true, horario: '9:00 – 18:00',
    rating: 4.9, opiniones: 58, plan: 'Destacado', zona: 'Valle Verde, Ensenada',
    servicios: 'Alternador, marcha, luces, escáner, baterías',
    tel: '6464445566', dir: 'Blvd. Zertuche 789, Valle Verde',
    reviews: [['Paola S.', 'Falla eléctrica que nadie encontraba, ellos sí la hallaron.']],
  },
  {
    nombre: 'Hojalatería Los Pinos', esp: 'Hojalatería y pintura', tipo: 'hojalateria', enApp: false,
    distKm: 3.4, lat: 31.8420, lng: -116.6200, abierto: true, horario: '8:00 – 18:00',
    rating: 4.6, opiniones: 41, plan: 'Básico', zona: 'Los Pinos, Ensenada',
    servicios: 'Pintura, pulido, presupuestos',
    tel: '6465556677', dir: 'Calle Pinos 12, Los Pinos',
    reviews: [['Roberto D.', 'Buen trabajo y buen precio.']],
  },
  {
    nombre: 'Mecánica y Eléctrico del Puerto', esp: 'Mecánica y eléctrico', tipo: 'mecanico', enApp: false,
    distKm: 2.1, lat: 31.8680, lng: -116.6250, abierto: true, horario: '8:00 – 19:00',
    rating: 4.7, opiniones: 93, plan: 'Destacado', zona: 'El Puerto, Ensenada',
    servicios: 'Mecánica general, eléctrico, escáner',
    tel: '6466667788', dir: 'Calle del Puerto 321, El Puerto',
    reviews: [['Daniela V.', 'Me explicaron la falla antes de cobrarme nada.']],
  },
];

// Servicios de ejemplo del taller demo con la app (El Faro).
const SEED_SERVICES = [
  { nombre: 'Hojalatería', precio: 'Desde $1,500' },
  { nombre: 'Pintura', precio: 'Desde $2,000' },
  { nombre: 'Presupuesto a domicilio', precio: 'Gratis' },
  { nombre: 'Pulido', precio: 'Desde $800' },
];

const SEED_OFFERS = [
  { titulo: 'Pintura de defensa completa', precio: '$2,500', vigencia: 'Hasta el sábado' },
];

// Incidentes del conductor → tipo de taller que los atiende.
// 'noarranca' acepta mecánico O eléctrico (como en el prototipo).
// 'otro' acepta todos los tipos.
const INCIDENT_TYPES = {
  choque: ['hojalateria'],
  presupuesto: ['hojalateria'],
  noarranca: ['mecanico', 'electrico'],
  grua: ['grua'],
  electrico: ['electrico'],
  otro: ['hojalateria', 'mecanico', 'electrico', 'grua'],
  foquito: null, // el tipo lo elige el usuario tras el diagnóstico
};

const INCIDENT_LABELS = {
  choque: 'Choqué', noarranca: 'No arranca', grua: 'Necesito grúa',
  presupuesto: 'Presupuesto de hojalatería', electrico: 'Falla eléctrica',
  otro: 'Otro problema', foquito: 'Foquito del tablero',
};

// Textos por incidente (los mismos del prototipo v3).
const INCIDENT_COPY = {
  choque: { buscar: 'Buscar taller ahora', resTitle: 'Talleres de hojalatería cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller de hojalatería más cercano.' },
  noarranca: { buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller más cercano.' },
  grua: { buscar: 'Buscar grúas cercanas', resTitle: 'Grúas cerca de ti', datosNote: 'Solo ocupamos esto para buscarte la grúa más cercana.' },
  presupuesto: { buscar: 'Buscar taller ahora', resTitle: 'Talleres de hojalatería cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller de hojalatería más cercano.' },
  electrico: { buscar: 'Buscar taller eléctrico', resTitle: 'Talleres eléctricos cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller eléctrico más cercano.' },
  otro: { buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti', datosNote: 'Descríbenos qué le pasa a tu carro para buscarte el taller adecuado.' },
  foquito: { buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller más cercano.' },
};

module.exports = { SEED_SHOPS, SEED_SERVICES, SEED_OFFERS, INCIDENT_TYPES, INCIDENT_LABELS, INCIDENT_COPY };
