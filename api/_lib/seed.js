'use strict';
// TallerYa — configuración de incidentes (NO son datos de ejemplo).
// Los talleres de ejemplo (SEED_SHOPS, 3 con app + 3 de Google) se
// eliminaron con la integración de Google Places: los talleres con la
// app son los que se registran, y los de Google son reales y vienen de
// la API de Google Places (api/_lib/places.js). Los datos de ejemplo
// solo existen ahora en los fixtures de test/places.test.js.

// Incidentes del conductor → tipo de taller que los atiende.
// 'noarranca' acepta mecánico O eléctrico (como en el prototipo).
// 'otro' acepta todos los tipos.
// 'presupuesto' ya no tiene botón (se unió con 'choqué', que es lo mismo:
// si chocaste necesitas el presupuesto del choque), pero se deja como
// alias para que un cliente viejo no falle.
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
  choque: { buscar: 'Buscar taller ahora', resTitle: 'Talleres de carrocería/hojalatería cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller de carrocería/hojalatería más cercano.' },
  noarranca: { buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller más cercano.' },
  grua: { buscar: 'Buscar grúas cercanas', resTitle: 'Grúas cerca de ti', datosNote: 'Solo ocupamos esto para buscarte la grúa más cercana.' },
  presupuesto: { buscar: 'Buscar taller ahora', resTitle: 'Talleres de carrocería/hojalatería cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller de carrocería/hojalatería más cercano.' },
  electrico: { buscar: 'Buscar taller eléctrico', resTitle: 'Talleres eléctricos cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller eléctrico más cercano.' },
  otro: { buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti', datosNote: 'Descríbenos qué le pasa a tu carro para buscarte el taller adecuado.' },
  foquito: { buscar: 'Buscar taller ahora', resTitle: 'Talleres cerca de ti', datosNote: 'Solo ocupamos esto para buscarte el taller más cercano.' },
};

module.exports = { INCIDENT_TYPES, INCIDENT_LABELS, INCIDENT_COPY };
