import type { GpsStatus } from './gpsQuality';

// Document palette follows the project GIS ramp; independent of screen theme.
export const GPS_DOCUMENT = { ink: '#143447', blue: '#0A22C9', sky: '#1AA3E6', aqua: '#B5EAD9', lime: '#A6DE5F', amber: '#F5B800', red: '#E32B2B', maroon: '#8E0F14', grey: '#C3C9CF', paper: '#FFFFFF', light: '#F0F7FA' };
export const GPS_LABEL: Record<GpsStatus, string> = {
  inside: 'Inside recorded LGA', border: 'Within 1 km of LGA line', near_border: '1–5 km across LGA line', swapped: 'Possible latitude/longitude swap', other_lga: 'Another LGA', other_state: 'Another State', outside_nigeria: 'Outside Nigeria boundary', unknown_lga: 'LGA name not recognised',
};
export const GPS_COLOUR: Record<GpsStatus, string> = {
  inside: GPS_DOCUMENT.blue, border: GPS_DOCUMENT.aqua, near_border: GPS_DOCUMENT.amber, swapped: GPS_DOCUMENT.sky, other_lga: GPS_DOCUMENT.red, other_state: GPS_DOCUMENT.maroon, outside_nigeria: GPS_DOCUMENT.maroon, unknown_lga: GPS_DOCUMENT.grey,
};
export function gpsFindingAction(status: GpsStatus) {
  if (status === 'inside') return 'No boundary issue detected';
  if (status === 'border' || status === 'near_border') return 'Boundary tolerance accepted; confirm locally if needed';
  if (status === 'swapped') return 'Verify original capture before swapping latitude/longitude';
  if (status === 'unknown_lga') return 'Verify recorded State/LGA spelling and location';
  return 'Verify source coordinates and recorded area; re-capture on site if incorrect';
}