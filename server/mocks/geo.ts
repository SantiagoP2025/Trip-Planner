import { randomFloat } from './prng.ts';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

// Sin geocodificador real todavía (sección 14.2: eso lo aporta Google Places),
// derivamos un punto base estable a partir del nombre del destino: mismo destino,
// mismo centro, para que alojamientos y actividades se agrupen de forma coherente.
export function deriveBaseCoordinate(destination: string): Coordinate {
  let hash = 0;
  for (let i = 0; i < destination.length; i += 1) {
    hash = (hash * 31 + destination.charCodeAt(i)) | 0;
  }
  const unsignedHash = hash >>> 0;
  const latitude = ((unsignedHash % 12000) / 100) - 60; // [-60, 60)
  const longitude = (((unsignedHash >> 12) % 36000) / 100) - 180; // [-180, 180)
  return { latitude, longitude };
}

// Dispersa un punto alrededor del centro del destino, dentro de un radio en km.
export function jitterCoordinate(base: Coordinate, random: () => number, radiusKm: number): Coordinate {
  const KM_PER_DEGREE_LAT = 111;
  const angle = randomFloat(random, 0, 360, 2) * (Math.PI / 180);
  const distanceKm = randomFloat(random, 0, radiusKm, 2);
  const latitude = base.latitude + (Math.cos(angle) * distanceKm) / KM_PER_DEGREE_LAT;
  const kmPerDegreeLon = KM_PER_DEGREE_LAT * Math.cos((base.latitude * Math.PI) / 180) || 1;
  const longitude = base.longitude + (Math.sin(angle) * distanceKm) / kmPerDegreeLon;
  return { latitude: Math.round(latitude * 1e4) / 1e4, longitude: Math.round(longitude * 1e4) / 1e4 };
}

// Distancia entre dos coordenadas (fórmula de Haversine), usada por el proveedor
// simulado de rutas hasta que Google Routes la sustituya (sección 14.2).
export function haversineDistanceKm(a: Coordinate, b: Coordinate): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const deltaLat = toRad(b.latitude - a.latitude);
  const deltaLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(EARTH_RADIUS_KM * c * 100) / 100;
}
