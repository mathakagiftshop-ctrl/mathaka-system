// Sri Lankan towns with approximate coordinates, used for the maps and for
// finding partners near a delivery. Add towns here if you deliver somewhere new.

export type City = { name: string; district: string; province: string; lat: number; lng: number };

const W = "Western", C = "Central", S = "Southern", N = "Northern", E = "Eastern", NW = "North Western", NC = "North Central", U = "Uva", SG = "Sabaragamuwa";

const rows: [string, string, string, number, number][] = [
  // Western
  ["Colombo", "Colombo", W, 6.9271, 79.8612], ["Dehiwala-Mount Lavinia", "Colombo", W, 6.839, 79.875], ["Moratuwa", "Colombo", W, 6.773, 79.8816],
  ["Kotte", "Colombo", W, 6.8868, 79.9187], ["Nugegoda", "Colombo", W, 6.8649, 79.8997], ["Maharagama", "Colombo", W, 6.848, 79.9265],
  ["Battaramulla", "Colombo", W, 6.899, 79.918], ["Malabe", "Colombo", W, 6.9048, 79.958], ["Kaduwela", "Colombo", W, 6.9335, 79.9848],
  ["Kolonnawa", "Colombo", W, 6.9329, 79.8848], ["Piliyandala", "Colombo", W, 6.8018, 79.9227], ["Homagama", "Colombo", W, 6.844, 80.002],
  ["Avissawella", "Colombo", W, 6.9543, 80.2046],
  ["Gampaha", "Gampaha", W, 7.0917, 79.999], ["Negombo", "Gampaha", W, 7.2083, 79.8358], ["Ja-Ela", "Gampaha", W, 7.0744, 79.8919],
  ["Wattala", "Gampaha", W, 6.9894, 79.8911], ["Kelaniya", "Gampaha", W, 6.9553, 79.922], ["Kiribathgoda", "Gampaha", W, 6.98, 79.929],
  ["Kadawatha", "Gampaha", W, 7.001, 79.953], ["Ragama", "Gampaha", W, 7.03, 79.922], ["Katunayake", "Gampaha", W, 7.17, 79.88],
  ["Minuwangoda", "Gampaha", W, 7.1667, 79.95], ["Divulapitiya", "Gampaha", W, 7.223, 80.014], ["Veyangoda", "Gampaha", W, 7.155, 80.06],
  ["Nittambuwa", "Gampaha", W, 7.144, 80.096], ["Mirigama", "Gampaha", W, 7.24, 80.13],
  ["Kalutara", "Kalutara", W, 6.5854, 79.9607], ["Panadura", "Kalutara", W, 6.7132, 79.9026], ["Wadduwa", "Kalutara", W, 6.667, 79.928],
  ["Bandaragama", "Kalutara", W, 6.714, 79.988], ["Horana", "Kalutara", W, 6.7159, 80.0626], ["Beruwala", "Kalutara", W, 6.4788, 79.9828],
  ["Aluthgama", "Kalutara", W, 6.433, 80.0], ["Matugama", "Kalutara", W, 6.522, 80.114],
  // Central
  ["Kandy", "Kandy", C, 7.2906, 80.6337], ["Peradeniya", "Kandy", C, 7.269, 80.594], ["Katugastota", "Kandy", C, 7.317, 80.621],
  ["Pilimathalawa", "Kandy", C, 7.2667, 80.55], ["Kundasale", "Kandy", C, 7.28, 80.69], ["Digana", "Kandy", C, 7.29, 80.74],
  ["Akurana", "Kandy", C, 7.365, 80.617], ["Gampola", "Kandy", C, 7.1643, 80.5696], ["Nawalapitiya", "Kandy", C, 7.048, 80.534],
  ["Matale", "Matale", C, 7.4675, 80.6234], ["Dambulla", "Matale", C, 7.86, 80.6517], ["Sigiriya", "Matale", C, 7.957, 80.76],
  ["Nuwara Eliya", "Nuwara Eliya", C, 6.9497, 80.7891], ["Hatton", "Nuwara Eliya", C, 6.8916, 80.5955], ["Talawakele", "Nuwara Eliya", C, 6.937, 80.658],
  // Southern
  ["Galle", "Galle", S, 6.0535, 80.221], ["Hikkaduwa", "Galle", S, 6.1395, 80.1063], ["Ambalangoda", "Galle", S, 6.235, 80.054],
  ["Baddegama", "Galle", S, 6.1667, 80.1833], ["Elpitiya", "Galle", S, 6.2913, 80.1675],
  ["Matara", "Matara", S, 5.9549, 80.555], ["Weligama", "Matara", S, 5.9747, 80.4297], ["Akuressa", "Matara", S, 6.1, 80.48],
  ["Dikwella", "Matara", S, 5.9667, 80.6833],
  ["Hambantota", "Hambantota", S, 6.1241, 81.1185], ["Tangalle", "Hambantota", S, 6.024, 80.794], ["Beliatta", "Hambantota", S, 6.0486, 80.7337],
  ["Ambalantota", "Hambantota", S, 6.12, 81.02], ["Tissamaharama", "Hambantota", S, 6.28, 81.29],
  // Northern
  ["Jaffna", "Jaffna", N, 9.6615, 80.0255], ["Chavakachcheri", "Jaffna", N, 9.6583, 80.16], ["Point Pedro", "Jaffna", N, 9.8167, 80.2333],
  ["Kilinochchi", "Kilinochchi", N, 9.3803, 80.377], ["Mannar", "Mannar", N, 8.981, 79.9044], ["Vavuniya", "Vavuniya", N, 8.7514, 80.4971],
  ["Mullaitivu", "Mullaitivu", N, 9.2671, 80.8142],
  // Eastern
  ["Trincomalee", "Trincomalee", E, 8.5874, 81.2152], ["Kinniya", "Trincomalee", E, 8.497, 81.177],
  ["Batticaloa", "Batticaloa", E, 7.731, 81.6747], ["Kattankudy", "Batticaloa", E, 7.675, 81.73], ["Eravur", "Batticaloa", E, 7.77, 81.6],
  ["Ampara", "Ampara", E, 7.2975, 81.682], ["Kalmunai", "Ampara", E, 7.4167, 81.8167], ["Sainthamaruthu", "Ampara", E, 7.3833, 81.8333],
  ["Akkaraipattu", "Ampara", E, 7.2167, 81.85],
  // North Western
  ["Kurunegala", "Kurunegala", NW, 7.4863, 80.3647], ["Kuliyapitiya", "Kurunegala", NW, 7.4688, 80.0401], ["Narammala", "Kurunegala", NW, 7.4333, 80.2167],
  ["Pannala", "Kurunegala", NW, 7.33, 80.02], ["Polgahawela", "Kurunegala", NW, 7.3333, 80.3], ["Wariyapola", "Kurunegala", NW, 7.628, 80.236],
  ["Nikaweratiya", "Kurunegala", NW, 7.75, 80.1167],
  ["Puttalam", "Puttalam", NW, 8.0362, 79.8283], ["Chilaw", "Puttalam", NW, 7.5758, 79.7953], ["Marawila", "Puttalam", NW, 7.4167, 79.8333],
  ["Nattandiya", "Puttalam", NW, 7.4086, 79.8683], ["Wennappuwa", "Puttalam", NW, 7.35, 79.85], ["Dankotuwa", "Puttalam", NW, 7.2917, 79.8833],
  // North Central
  ["Anuradhapura", "Anuradhapura", NC, 8.3114, 80.4037], ["Kekirawa", "Anuradhapura", NC, 8.0386, 80.5983], ["Medawachchiya", "Anuradhapura", NC, 8.54, 80.49],
  ["Tambuttegama", "Anuradhapura", NC, 8.16, 80.3],
  ["Polonnaruwa", "Polonnaruwa", NC, 7.9403, 81.0188], ["Hingurakgoda", "Polonnaruwa", NC, 8.04, 80.95], ["Medirigiriya", "Polonnaruwa", NC, 8.14, 80.96],
  // Uva
  ["Badulla", "Badulla", U, 6.9934, 81.055], ["Bandarawela", "Badulla", U, 6.8328, 80.9844], ["Haputale", "Badulla", U, 6.765, 80.951],
  ["Ella", "Badulla", U, 6.8667, 81.0466], ["Welimada", "Badulla", U, 6.9, 80.91], ["Passara", "Badulla", U, 6.935, 81.153],
  ["Mahiyanganaya", "Badulla", U, 7.3167, 81.0],
  ["Monaragala", "Monaragala", U, 6.8728, 81.3507], ["Wellawaya", "Monaragala", U, 6.7333, 81.1], ["Buttala", "Monaragala", U, 6.75, 81.2333],
  ["Bibile", "Monaragala", U, 7.1667, 81.2167],
  // Sabaragamuwa
  ["Ratnapura", "Ratnapura", SG, 6.6828, 80.3992], ["Kuruwita", "Ratnapura", SG, 6.78, 80.37], ["Eheliyagoda", "Ratnapura", SG, 6.85, 80.2667],
  ["Pelmadulla", "Ratnapura", SG, 6.62, 80.54], ["Balangoda", "Ratnapura", SG, 6.65, 80.7], ["Embilipitiya", "Ratnapura", SG, 6.3439, 80.8489],
  ["Kegalle", "Kegalle", SG, 7.2513, 80.3464], ["Mawanella", "Kegalle", SG, 7.25, 80.45], ["Warakapola", "Kegalle", SG, 7.227, 80.197],
  ["Rambukkana", "Kegalle", SG, 7.3233, 80.3919], ["Ruwanwella", "Kegalle", SG, 7.05, 80.25], ["Deraniyagala", "Kegalle", SG, 6.93, 80.34],
];

export const CITIES: City[] = rows.map(([name, district, province, lat, lng]) => ({ name, district, province, lat, lng }));

const byName = new Map(CITIES.map((city) => [normalize(city.name), city]));

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z]/g, "");
}

export function findCity(name: string | null | undefined): City | undefined {
  return name ? byName.get(normalize(name)) : undefined;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export type PartnerLocation = { city: string; serviceRadiusKm: number; extraCities: string[] };
export type Coverage = { covers: boolean; distanceKm: number | null; reason: string };

/**
 * Does a partner cover a delivery city? A partner covers their own city, any
 * town within their service radius, and any extra towns they listed.
 */
export function coverage(partner: PartnerLocation, target: string): Coverage {
  const home = findCity(partner.city);
  const destination = findCity(target);
  const distance = home && destination ? Math.round(distanceKm(home, destination) * 10) / 10 : null;
  if (normalize(partner.city) === normalize(target)) return { covers: true, distanceKm: 0, reason: "Based here" };
  if (partner.extraCities.some((city) => normalize(city) === normalize(target))) return { covers: true, distanceKm: distance, reason: "Listed service area" };
  if (distance !== null && distance <= partner.serviceRadiusKm) return { covers: true, distanceKm: distance, reason: `Within ${partner.serviceRadiusKm} km` };
  return { covers: false, distanceKm: distance, reason: distance === null ? "Unknown distance" : `${Math.round(distance)} km away` };
}
