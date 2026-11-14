import { haversineKm, type Place } from './artifacts';
import type { Tile } from './types';

export const MATCH_COLORS = { red: '#ef4444', orange: '#f97316', yellow: '#facc15' };
export function matchTier(rank: number): keyof typeof MATCH_COLORS {
  return rank <= 3 ? 'red' : rank <= 8 ? 'orange' : 'yellow';
}
export function nearbyPlace(tile: Pick<Tile, 'lat' | 'lon'>, places: Place[]) {
  const sorted = places.map(place => ({ place, km: haversineKm(tile, place) })).sort((a,b) => a.km-b.km);
  const nearest = sorted[0];
  if (!nearest) return { name: 'Western Desert, Egypt', detail: 'Desert terrain' };
  const bearing = Math.atan2(tile.lon-nearest.place.lon, tile.lat-nearest.place.lat) * 180 / Math.PI;
  const direction = ['north','northeast','east','southeast','south','southwest','west','northwest'][Math.round((bearing+360)/45)%8];
  return {
    name: `${Math.round(nearest.km)} km ${direction} of ${nearest.place.name}`,
    detail: `${nearest.place.area} · Egypt`,
  };
}
export function satelliteUrl(lat: number, lon: number, width = 640): string {
  const halfLat = 0.035;
  const halfLon = halfLat / Math.cos(lat * Math.PI / 180);
  const query = new URLSearchParams({ service: 'WMS', request: 'GetMap', version: '1.1.1',
    layers: 's2cloudless-2023', styles: '', srs: 'EPSG:4326',
    bbox: `${lon-halfLon},${lat-halfLat},${lon+halfLon},${lat+halfLat}`,
    width: String(width), height: String(width), format: 'image/jpeg' });
  return `https://tiles.maps.eox.at/wms?${query}`;
}
