'use strict';
// Foquitos del tablero: qué significa cada uno y a qué especialista lleva.
// Misma lista aprobada en el prototipo v3. La lectura por IA de la foto
// (Gemini, como la lectura de dorsales de OnlyClick) es un gancho para v2:
// en v1 el usuario pica a mano los foquitos que ve prendidos.
const FOCOS = [
  { id: 'check', icono: '🔧', nombre: 'Check engine (motor)', significa: 'El motor tiene una falla. Puede ser algo leve o serio; hay que escanearlo para saber.', urgencia: 'Revisa pronto', esp: 'mecanico', espLabel: 'mecánico' },
  { id: 'bateria', icono: '🔋', nombre: 'Batería', significa: 'No está cargando. Puede ser la batería, el alternador o la banda.', urgencia: 'Revisa pronto', esp: 'electrico', espLabel: 'eléctrico' },
  { id: 'aceite', icono: '🛢️', nombre: 'Presión de aceite', significa: '¡Peligro! El motor se puede dañar si sigues manejando sin aceite.', urgencia: '¡No sigas manejando!', esp: 'mecanico', espLabel: 'mecánico' },
  { id: 'temp', icono: '🌡️', nombre: 'Temperatura', significa: 'El motor se está calentando. Apágalo y espera a que se enfríe antes de revisar el agua.', urgencia: '¡No sigas manejando!', esp: 'mecanico', espLabel: 'mecánico' },
  { id: 'frenos', icono: '🛑', nombre: 'Frenos', significa: 'Falta líquido de frenos o hay una falla. No es seguro seguir manejando así.', urgencia: '¡No sigas manejando!', esp: 'mecanico', espLabel: 'mecánico' },
  { id: 'abs', icono: 'ⓐ', nombre: 'ABS', significa: 'El sistema antibloqueo tiene falla. Los frenos normales sí jalan, pero ve con cuidado.', urgencia: 'Revisa pronto', esp: 'mecanico', espLabel: 'mecánico' },
  { id: 'airbag', icono: '💺', nombre: 'Bolsa de aire', significa: 'La bolsa de aire puede no abrir si chocas. Hay que revisarla.', urgencia: 'Revisa pronto', esp: 'electrico', espLabel: 'eléctrico' },
  { id: 'llanta', icono: '🛞', nombre: 'Presión de llantas', significa: 'Una llanta está baja. Revisa la presión y si trae un clavo o está ponchada.', urgencia: 'Puedes seguir con cuidado', esp: 'mecanico', espLabel: 'mecánico' },
  { id: 'direccion', icono: '🎛️', nombre: 'Dirección', significa: 'La dirección asistida tiene falla; el volante se pone duro.', urgencia: 'Revisa pronto', esp: 'mecanico', espLabel: 'mecánico' },
  { id: 'gas', icono: '⛽', nombre: 'Gasolina', significa: 'Te queda poca gasolina. Echa gasolina antes de que te quedes tirado.', urgencia: 'Echa gasolina', esp: null, espLabel: null },
];

// Dados los ids de foquitos prendidos, devuelve el significado de cada uno
// y los especialistas distintos que se recomiendan (para los botones
// "Buscar taller mecánico / eléctrico ahora").
function specialistForFocos(ids) {
  const sel = FOCOS.filter(f => (ids || []).includes(f.id));
  const esps = {};
  sel.forEach(f => { if (f.esp) esps[f.esp] = f.espLabel; });
  return { focos: sel, especialistas: Object.keys(esps).map(t => ({ tipo: t, label: esps[t] })) };
}

module.exports = { FOCOS, specialistForFocos };
