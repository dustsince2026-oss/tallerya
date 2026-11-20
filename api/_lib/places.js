'use strict';
// TallerYa — talleres reales de Google Places (API New).
// La búsqueda muestra primero los talleres registrados en la app y
// después los de Google (reales, no de ejemplo). La llave se pone en la
// variable de entorno GOOGLE_PLACES_API_KEY (Vercel → Environment
// Variables). Sin llave, o si Google falla, la búsqueda devuelve solo
// los talleres con la app (nunca datos de ejemplo).
//
// Text Search: POST https://places.googleapis.com/v1/places:searchText
// Place Details: GET https://places.googleapis.com/v1/places/{placeId}

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';

const SEARCH_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress',
  'places.rating', 'places.userRatingCount', 'places.internationalPhoneNumber',
  'places.location', 'places.types', 'places.businessStatus',
  'places.regularOpeningHours',
].join(',');
const DETAILS_FIELD_MASK = SEARCH_FIELD_MASK.replace(/places\./g, '');

// Tipo de taller → lo que se le pregunta a Google (todo en Ensenada).
const QUERY_TEXT = {
  mecanico: 'taller mecánico en Ensenada',
  hojalateria: 'hojalatería y pintura en Ensenada',
  grua: 'grúas en Ensenada',
  electrico: 'taller eléctrico automotriz en Ensenada',
};
// Especialidad que se muestra en la ficha, según el tipo buscado.
const ESP_POR_TIPO = {
  mecanico: 'Mecánica general',
  hojalateria: 'Hojalatería y pintura',
  grua: 'Grúas y arrastre',
  electrico: 'Eléctrico automotriz',
};

function timeoutMs() {
  const n = Number(process.env.PLACES_TIMEOUT_MS || 8000);
  return Number.isFinite(n) && n > 0 ? n : 8000;
}
function apiKey() {
  return (process.env.GOOGLE_PLACES_API_KEY || '').trim();
}

async function fetchJson(url, opts, fetchImpl) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('No hay fetch disponible.');
  const ms = timeoutMs();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    // La carrera también rechaza si el fetch ignora la señal de aborto
    // (como un stub de pruebas): el timeout manda en todos los casos.
    const res = await Promise.race([
      fetchFn(url, { ...opts, signal: ctrl.signal }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Google Places tardó demasiado.')), ms)),
    ]);
    if (!res.ok) {
      const e = new Error('Google Places respondió ' + res.status + '.');
      e.status = res.status;
      throw e;
    }
    return res.json();
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Google Places tardó demasiado.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Distancia real entre dos puntos (km). La misma fórmula que handlers.js.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// El teléfono de Google viene con lada internacional ("+52 646 ...").
// La app guarda teléfonos locales de 10 dígitos (así arma el link de
// WhatsApp con el 52 por fuera), así que se quita el 52 de enfrente.
function telefonoLocal(internationalPhoneNumber) {
  const d = String(internationalPhoneNumber || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('52')) return d.slice(2);
  return d;
}

// Horario de hoy, sacado de weekdayDescriptions ("lunes: 8:00 – 18:00").
// Las descripciones vienen en español (languageCode: 'es').
function horarioDeHoy(regularOpeningHours) {
  const desc = regularOpeningHours && regularOpeningHours.weekdayDescriptions;
  if (!Array.isArray(desc) || !desc.length) return '';
  const idx = (new Date().getDay() + 6) % 7; // lunes = 0 … domingo = 6
  const hoy = desc[idx] || '';
  const i = hoy.indexOf(':');
  return i >= 0 ? hoy.slice(i + 1).trim() : hoy;
}

// Un lugar de Google → la misma forma pública que publicAppShop().
function mapPlace(place, tipo, lat, lng) {
  if (!place || !place.id || !place.displayName || !place.displayName.text) return null;
  const plat = place.location ? Number(place.location.latitude) : null;
  const plng = place.location ? Number(place.location.longitude) : null;
  const distKm = (lat != null && lng != null && plat != null && plng != null)
    ? haversineKm(Number(lat), Number(lng), plat, plng)
    : 0;
  const hours = place.regularOpeningHours || null;
  return {
    id: 'places:' + place.id,
    source: 'google',
    enApp: false,
    nombre: place.displayName.text,
    esp: ESP_POR_TIPO[tipo] || 'Taller mecánico',
    tipos: [tipo],
    zona: 'Ensenada',
    dir: place.formattedAddress || '',
    tel: telefonoLocal(place.internationalPhoneNumber),
    horario: horarioDeHoy(hours),
    rating: Number(place.rating || 0),
    opiniones: Number(place.userRatingCount || 0),
    plan: 'Básico',
    distKm,
    lat: plat,
    lng: plng,
    abierto: hours && hours.openNow !== undefined ? !!hours.openNow : true,
    servicios: '',
    tieneGrua: tipo === 'grua',
    aDomicilio: false,
    ofertas: [],
  };
}

// Nombre normalizado para comparar talleres (sin acentos ni signos).
function normalizeName(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Un taller registrado en la app no debe salir dos veces: si un lugar de
// Google tiene el mismo nombre y está a menos de ~200 m (o no hay
// coordenadas para comparar), se quita de los resultados de Google.
function dedupePlaces(places, appShops) {
  return (places || []).filter(p => {
    const pn = normalizeName(p.nombre);
    if (!pn) return true;
    return !(appShops || []).some(w => {
      if (normalizeName(w.nombre) !== pn) return false;
      if (p.lat != null && p.lng != null && w.lat != null && w.lng != null) {
        return haversineKm(Number(p.lat), Number(p.lng), Number(w.lat), Number(w.lng)) < 0.2;
      }
      return true; // mismo nombre y sin coordenadas: es el mismo taller
    });
  });
}

// El tipo que se le pregunta a Google según el incidente: si el incidente
// acepta un solo tipo, ese; si acepta varios (noarranca, otro, foquito),
// el genérico (mecánico).
function tipoForPlaces(tipos) {
  if (Array.isArray(tipos) && tipos.length === 1 && QUERY_TEXT[tipos[0]]) return tipos[0];
  return 'mecanico';
}

async function searchPlaces({ tipo, lat, lng, key, fetchImpl }) {
  const k = (key !== undefined ? key : apiKey());
  if (!k) throw new Error('Falta GOOGLE_PLACES_API_KEY.');
  const t = QUERY_TEXT[tipo] ? tipo : 'mecanico';
  const body = {
    textQuery: QUERY_TEXT[t],
    languageCode: 'es',
    regionCode: 'MX',
    maxResultCount: 10,
  };
  if (lat != null && lng != null) {
    body.locationBias = {
      circle: { center: { latitude: Number(lat), longitude: Number(lng) }, radius: 15000 },
    };
  }
  const data = await fetchJson(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': k,
      'X-Goog-FieldMask': SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  }, fetchImpl);
  const out = [];
  for (const p of (data.places || [])) {
    if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
    const mapped = mapPlace(p, t, lat, lng);
    if (mapped) out.push(mapped);
  }
  return out;
}

// Devuelve el taller mapeado, o null si Google dice que no existe (404).
// opts.tipo: el tipo que se buscó (hojalateria, grua…); si no viene, se
// usa 'mecanico'. opts.lat/lng: la ubicación del conductor, para la
// distancia real.
async function getPlaceDetails(placeId, { key, fetchImpl, tipo, lat, lng } = {}) {
  const k = (key !== undefined ? key : apiKey());
  if (!k) throw new Error('Falta GOOGLE_PLACES_API_KEY.');
  const id = String(placeId || '').replace(/^places:/, '');
  if (!id) return null;
  let data;
  try {
    data = await fetchJson(DETAILS_URL + encodeURIComponent(id) + '?languageCode=es', {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
    }, fetchImpl);
  } catch (e) {
    if (e && e.status === 404) return null;
    throw e;
  }
  if (!data || data.businessStatus === 'CLOSED_PERMANENTLY') return null;
  const t = (tipo && QUERY_TEXT[tipo]) ? tipo : 'mecanico';
  return mapPlace(data, t, lat, lng);
}

module.exports = { searchPlaces, getPlaceDetails, mapPlace, dedupePlaces, tipoForPlaces, normalizeName, QUERY_TEXT };
