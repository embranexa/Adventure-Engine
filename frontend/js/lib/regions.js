// Spatial levels above a city (pure): city -> region (its county) -> metro.
//
// Sources give a city name and not always coordinates (19hz has none), so the levels
// come from the city name first. Fallbacks, for items whose city isn't in the table:
//   region  the region of the nearest anchor city (ANCHORS) within ANCHOR_KM of its coordinates
//   metro   a known city named in its area text ("1 Hour from Downtown Los Angeles")
// Names are matched case-insensitively; cityName() tidies stray capitals ("Los ANgeles").

/** Region -> its metro. */
export const REGION_METRO = {
    'Los Angeles County': 'Greater Los Angeles',
    'Orange County': 'Greater Los Angeles',
    'Inland Empire': 'Greater Los Angeles',
    'Ventura County': 'Greater Los Angeles',
    'San Diego County': 'San Diego',
    'Santa Barbara County': 'Central Coast',
    'Imperial County': 'Imperial Valley',
};

/** Region -> its cities (and well-known neighborhoods sources give as a city). */
const REGION_CITIES = {
    'Los Angeles County': [
        'los angeles', 'la', 'dtla', 'downtown los angeles', 'east los angeles', 'hollywood', 'west hollywood',
        'north hollywood', 'highland park', 'venice', 'silver lake', 'echo park', 'koreatown', 'van nuys',
        'santa monica', 'culver city', 'beverly hills', 'burbank', 'glendale', 'pasadena', 'south pasadena',
        'alhambra', 'arcadia', 'monterey park', 'san gabriel', 'el monte', 'rowland heights', 'west covina',
        'covina', 'la verne', 'claremont', 'san dimas', 'pomona', 'whittier', 'montebello', 'commerce', 'vernon',
        'downey', 'norwalk', 'cerritos', 'lakewood', 'long beach', 'carson', 'compton', 'gardena', 'inglewood',
        'el segundo', 'torrance', 'redondo beach', 'hermosa beach', 'manhattan beach', 'san pedro', 'malibu',
        'calabasas', 'agoura hills', 'santa clarita', 'valencia', 'lancaster', 'palmdale', 'hi vista',
    ],
    'Orange County': [
        'costa mesa', 'huntington beach', 'santa ana', 'anaheim', 'irvine', 'newport beach', 'fullerton',
        'orange', 'garden grove', 'tustin', 'laguna beach', 'mission viejo', 'lake forest', 'buena park',
        'westminster', 'fountain valley', 'san clemente', 'dana point', 'yorba linda', 'brea', 'seal beach',
    ],
    'Inland Empire': [
        'riverside', 'san bernardino', 'corona', 'ontario', 'rancho cucamonga', 'fontana', 'moreno valley',
        'temecula', 'murrieta', 'perris', 'redlands', 'upland', 'chino', 'palm springs', 'indio', 'coachella',
    ],
    'Ventura County': ['ventura', 'oxnard', 'thousand oaks', 'simi valley', 'camarillo', 'ojai', 'moorpark'],
    'San Diego County': [
        'san diego', 'del mar', 'la jolla', 'oceanside', 'carlsbad', 'encinitas', 'solana beach', 'escondido',
        'chula vista', 'national city', 'el cajon', 'la mesa', 'san marcos', 'vista',
    ],
    'Santa Barbara County': ['santa barbara', 'goleta', 'isla vista', 'carpinteria', 'santa maria'],
    'Imperial County': ['el centro', 'brawley', 'calexico'],
};

/** @type {Map<string, string>} lowercased city -> region */
const CITY_REGION = new Map(Object.entries(REGION_CITIES).flatMap(([region, cities]) => cities.map((c) => [c, region])));

/** A city's region (county), or null if unknown. @param {string | null | undefined} city */
export function regionOf(city) {
    return city ? CITY_REGION.get(city.trim().toLowerCase()) ?? null : null;
}

/** @param {string | null} region */
const metroOfRegion = (region) => (region ? REGION_METRO[/** @type {keyof typeof REGION_METRO} */ (region)] ?? null : null);

/** A city's metro, or null if unknown. @param {string | null | undefined} city */
export function metroOf(city) {
    return metroOfRegion(regionOf(city));
}

/** 'Los ANgeles' -> 'Los Angeles', 'san diego' -> 'San Diego'; well-formed names are kept. @param {string | null | undefined} city */
export function cityName(city) {
    const name = city?.trim().replace(/\s+/g, ' ');
    if (!name) return null;
    const odd = name === name.toLowerCase() || name.split(' ').some((w) => /[a-z][A-Z]{2,}|[A-Z]{2,}[a-z]/.test(w));
    return odd ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : name;
}

/** Anchor cities [region, lat, lon]: an item with coordinates but no known city takes the nearest one's region. */
const ANCHORS = /** @type {[string, number, number][]} */ ([
    ['Los Angeles County', 34.05, -118.24], ['Los Angeles County', 33.77, -118.19], ['Los Angeles County', 34.39, -118.54],
    ['Los Angeles County', 34.69, -118.15], ['Los Angeles County', 34.06, -117.75], ['Los Angeles County', 34.03, -118.78],
    ['Los Angeles County', 34.15, -118.14], ['Los Angeles County', 33.84, -118.34],
    ['Orange County', 33.75, -117.87], ['Orange County', 33.68, -117.83], ['Orange County', 33.84, -117.91],
    ['Orange County', 33.43, -117.61], ['Orange County', 33.66, -118.0],
    ['Inland Empire', 33.95, -117.4], ['Inland Empire', 34.11, -117.29], ['Inland Empire', 34.06, -117.65],
    ['Inland Empire', 33.49, -117.15], ['Inland Empire', 33.83, -116.55], ['Inland Empire', 33.72, -116.22], ['Inland Empire', 34.54, -117.29],
    ['Ventura County', 34.27, -119.23], ['Ventura County', 34.2, -119.18], ['Ventura County', 34.17, -118.84], ['Ventura County', 34.27, -118.78],
    ['San Diego County', 32.72, -117.16], ['San Diego County', 33.2, -117.38], ['San Diego County', 33.12, -117.09],
    ['San Diego County', 32.64, -117.08], ['San Diego County', 32.79, -116.96],
    ['Santa Barbara County', 34.42, -119.7], ['Santa Barbara County', 34.95, -120.44], ['Santa Barbara County', 34.64, -120.46],
    ['Imperial County', 32.79, -115.56], ['Imperial County', 32.98, -115.53],
]);
const ANCHOR_KM = 35;

/** The region of the nearest anchor within ANCHOR_KM, or null. @param {number | null | undefined} lat @param {number | null | undefined} lon */
export function regionNear(lat, lon) {
    if (lat == null || lon == null) return null;
    let best = null, bestKm = ANCHOR_KM;
    for (const [region, alat, alon] of ANCHORS) {
        const dy = (lat - alat) * 111.32, dx = (lon - alon) * 111.32 * Math.cos(lat * Math.PI / 180);
        const km = Math.hypot(dx, dy);
        if (km < bestKm) { bestKm = km; best = region; }
    }
    return best;
}

/** Cities longest first, so "west hollywood" wins over "hollywood" in free text. */
const CITIES_BY_LENGTH = [...CITY_REGION.keys()].filter((c) => c.length > 3).sort((a, b) => b.length - a.length);

/** The region of a known city named inside free text ("1 Hour from Downtown Los Angeles"), or null. @param {unknown} text */
function regionInText(text) {
    if (typeof text !== 'string') return null;
    const t = ` ${text.toLowerCase().replace(/[^a-z]+/g, ' ')} `;
    const city = CITIES_BY_LENGTH.find((c) => t.includes(` ${c} `));
    return city ? CITY_REGION.get(city) ?? null : null;
}

/** An item's region: by its city, else by its coordinates. @param {{ city?: string | null, lat?: number | null, lon?: number | null }} item */
export function itemRegion(item) {
    return regionOf(item.city) ?? regionNear(item.lat, item.lon);
}

/** An item's metro: by its region, else by a city its area text names (an area near a
 *  city is in that city's metro, if not provably its region).
 *  @param {{ city?: string | null, lat?: number | null, lon?: number | null, details?: Record<string, unknown> }} item */
export function itemMetro(item) {
    return metroOfRegion(itemRegion(item)) ?? metroOfRegion(regionInText(item.details?.area));
}
