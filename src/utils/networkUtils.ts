import * as d3 from 'd3';
import {
  Airport,
  CONTINENTS,
  Continent,
  DEFAULT_ROUTE_COLOR,
  NetworkData,
  RouteSector,
} from '../types/network';

const SMALL_CONNECTORS = new Set([
  'am',
  'an',
  'de',
  'da',
  'do',
  'dos',
  'das',
  'del',
  'der',
  'des',
  'du',
  'la',
  'le',
  'les',
  'of',
  'on',
  'und',
  'sur',
  'im',
]);

/**
 * Preserves natural mixed-case city names (e.g. "Frankfurt am Main", "New York JFK",
 * "Rio de Janeiro", "St. John's"). If a legacy database record is stored entirely in
 * lowercase, smartly formats it for clean cartographic display.
 */
export function formatCityName(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed !== trimmed.toLowerCase()) {
    return trimmed;
  }

  return trimmed
    .split(/(\s+|-)/)
    .map((part, idx) => {
      if (!part || /^\s+$/.test(part) || part === '-') return part;
      const lower = part.toLowerCase();
      if (idx > 0 && SMALL_CONNECTORS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function isValidIcao(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9]{3,4}$/.test(value.trim().toUpperCase());
}

export function parseAircraftList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [
      ...new Set(
        raw
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
          .slice(0, 20),
      ),
    ];
  }
  if (typeof raw === 'string') {
    return [
      ...new Set(
        raw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 20),
      ),
    ];
  }
  return ['A320neo'];
}

export function sanitizeNetworkPayload(payload: unknown): NetworkData {
  if (!payload || typeof payload !== 'object') {
    return { airports: [], routes: [] };
  }
  const obj = payload as Record<string, unknown>;
  const rawAirports = Array.isArray(obj.airports) ? obj.airports : [];
  const rawRoutes = Array.isArray(obj.routes) ? obj.routes : [];
  const legacyColor = isValidHexColor(obj.routeColor) ? obj.routeColor : DEFAULT_ROUTE_COLOR;

  const seenIcao = new Set<string>();
  const airports: Airport[] = [];

  for (const item of rawAirports) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.icao !== 'string' || typeof a.city !== 'string') continue;

    const icao = a.icao.trim().toUpperCase().slice(0, 4);
    if (!/^[A-Z0-9]{3,4}$/.test(icao) || seenIcao.has(icao)) continue;
    seenIcao.add(icao);

    const latNum = Number(a.lat);
    const lonNum = Number(a.lon);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) continue;

    const continentRaw = String(a.continent || 'Europe').trim();
    const continent = CONTINENTS.includes(continentRaw as Continent) ? continentRaw : continentRaw || 'Europe';

    airports.push({
      icao,
      city: formatCityName(a.city).slice(0, 80),
      lat: Math.max(-85, Math.min(85, latNum)),
      lon: Math.max(-180, Math.min(180, lonNum)),
      continent,
      isHub: Boolean(a.isHub),
      active: a.active === undefined ? true : Boolean(a.active),
      remarks: String(a.remarks ?? '').trim().slice(0, 300),
    });
  }

  const validCodes = new Set(airports.map((a) => a.icao));
  const routes: RouteSector[] = [];

  for (const item of rawRoutes) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const origin = typeof r.origin === 'string' ? r.origin.trim().toUpperCase() : '';
    const dest = typeof r.dest === 'string' ? r.dest.trim().toUpperCase() : '';
    if (!validCodes.has(origin) || !validCodes.has(dest) || origin === dest) continue;

    const list = parseAircraftList(r.aircraftTypes ?? r.aircraft);
    const color = isValidHexColor(r.color) ? r.color : legacyColor;
    const routeType = String(r.type ?? r.frequency ?? 'Scheduled').trim().slice(0, 40) || 'Scheduled';

    routes.push({
      origin,
      dest,
      aircraftTypes: list.length ? list : ['A320neo'],
      type: routeType,
      remarks: String(r.remarks ?? '').trim().slice(0, 300),
      color,
    });
  }

  return { airports, routes };
}

export function calculateGreatCircleNm(src: Pick<Airport, 'lon' | 'lat'>, dst: Pick<Airport, 'lon' | 'lat'>): number {
  const rad = d3.geoDistance([src.lon, src.lat], [dst.lon, dst.lat]);
  return Math.round((rad * 6371) / 1.852);
}

export function getRouteKey(route: { origin: string; dest: string; type?: string }, index?: number): string {
  return index !== undefined ? `${route.origin}->${route.dest}#${index}` : `${route.origin}->${route.dest}`;
}

export function getUnorderedPairKey(a: string, b: string): string {
  return a < b ? `${a}<->${b}` : `${b}<->${a}`;
}

/**
 * Computes projected SVG path strings for a great-circle arc between two airports,
 * splitting cleanly across the antimeridian and applying a smooth perpendicular
 * curvature offset when multiple/bidirectional sectors share the same airport pair.
 */
export function buildProjectedFlightPaths(
  src: Pick<Airport, 'lon' | 'lat'>,
  dst: Pick<Airport, 'lon' | 'lat'>,
  projection: d3.GeoProjection,
  parallelSlot = 0,
  parallelTotal = 1,
  steps = 64,
): string[] {
  const interp = d3.geoInterpolate([src.lon, src.lat], [dst.lon, dst.lat]);
  const geoSegments: Array<Array<[number, number]>> = [[]];
  let prevLon: number | null = null;

  for (let i = 0; i <= steps; i++) {
    const [lon, lat] = interp(i / steps);
    if (prevLon !== null && Math.abs(lon - prevLon) > 170) {
      geoSegments.push([]);
    }
    geoSegments[geoSegments.length - 1].push([lon, lat]);
    prevLon = lon;
  }

  // Canonical direction ensures A->B and B->A bend to opposite sides instead of cancelling out
  const offsetMag =
    parallelTotal > 1 ? (parallelSlot - (parallelTotal - 1) / 2) * 14 : 0;

  const lineGen = d3.line<[number, number]>().x((p) => p[0]).y((p) => p[1]);
  const paths: string[] = [];

  for (const seg of geoSegments) {
    if (seg.length < 2) continue;
    const projected: Array<[number, number]> = [];
    for (const coord of seg) {
      const pt = projection(coord);
      if (pt && !Number.isNaN(pt[0]) && !Number.isNaN(pt[1])) {
        projected.push(pt);
      }
    }
    if (projected.length < 2) continue;

    if (offsetMag === 0) {
      const dStr = lineGen(projected);
      if (dStr) paths.push(dStr);
      continue;
    }

    const startPt = projected[0];
    const endPt = projected[projected.length - 1];
    const dx = endPt[0] - startPt[0];
    const dy = endPt[1] - startPt[1];
    const chordLen = Math.hypot(dx, dy) || 1;
    // Canonical normal independent of endpoint ordering
    const flip = startPt[0] < endPt[0] || (startPt[0] === endPt[0] && startPt[1] <= endPt[1]) ? 1 : -1;
    const nx = (-dy / chordLen) * flip;
    const ny = (dx / chordLen) * flip;
    const clampedOffset = Math.sign(offsetMag) * Math.min(Math.abs(offsetMag), chordLen * 0.16);

    const offsetPts: Array<[number, number]> = projected.map((pt, i) => {
      const t = i / (projected.length - 1);
      const bend = Math.sin(Math.PI * t) * clampedOffset;
      return [pt[0] + nx * bend, pt[1] + ny * bend];
    });

    const dStr = lineGen(offsetPts);
    if (dStr) paths.push(dStr);
  }

  return paths;
}

/**
 * Geographic heuristic to auto-select a Region when picking coordinates on the map.
 */
export function inferContinentFromCoords(lat: number, lon: number): Continent {
  if (lon < -30) {
    return lat >= 12 ? 'North America' : 'South America';
  }
  if (lon >= 110 && lat < -5) {
    return 'Oceania';
  }
  if (lon >= 34 && lon <= 62 && lat >= 12 && lat <= 40) {
    return 'Middle East';
  }
  if (lon >= -20 && lon <= 52 && lat < 35) {
    return 'Africa';
  }
  if (lon >= -25 && lon <= 45 && lat >= 35) {
    return 'Europe';
  }
  if (lon > 45 && lat >= -10) {
    return 'Asia';
  }
  return 'Europe';
}

export function cloneNetworkData(data: NetworkData): NetworkData {
  return {
    airports: data.airports.map((a) => ({ ...a })),
    routes: data.routes.map((r) => ({ ...r, aircraftTypes: [...r.aircraftTypes] })),
  };
}

export function areNetworksEqual(a: NetworkData, b: NetworkData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function computeRouteCountMap(routes: Array<{ origin: string; dest: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of routes) {
    counts.set(r.origin, (counts.get(r.origin) || 0) + 1);
    counts.set(r.dest, (counts.get(r.dest) || 0) + 1);
  }
  return counts;
}

export function getRouteIdentityKey(r: RouteSector): string {
  return `${r.origin}->${r.dest}|${r.type.trim().toLowerCase()}`;
}

export function getRouteContentSignature(r: RouteSector): string {
  return JSON.stringify({
    origin: r.origin,
    dest: r.dest,
    aircraftTypes: [...r.aircraftTypes].sort(),
    type: r.type,
    remarks: r.remarks,
    color: r.color.toLowerCase(),
  });
}

function getAirportContentSignature(a: Airport): string {
  return JSON.stringify({
    icao: a.icao,
    city: formatCityName(a.city),
    lat: Number(a.lat.toFixed(4)),
    lon: Number(a.lon.toFixed(4)),
    continent: a.continent,
    isHub: a.isHub,
    active: a.active !== false,
    remarks: a.remarks,
  });
}

export function computeNetworkDiff(
  live: NetworkData,
  sandbox: NetworkData,
): import('../types/network').NetworkDiffSummary {
  const liveAirportMap = new Map(live.airports.map((a) => [a.icao, a]));
  const sandboxAirportMap = new Map(sandbox.airports.map((a) => [a.icao, a]));

  const airportsAdded: Airport[] = [];
  const airportsModified: Airport[] = [];
  const airportsRemoved: Airport[] = [];
  const addedAirportIcaos = new Set<string>();
  const modifiedAirportIcaos = new Set<string>();

  for (const ap of sandbox.airports) {
    const existing = liveAirportMap.get(ap.icao);
    if (!existing) {
      airportsAdded.push(ap);
      addedAirportIcaos.add(ap.icao);
    } else if (getAirportContentSignature(existing) !== getAirportContentSignature(ap)) {
      airportsModified.push(ap);
      modifiedAirportIcaos.add(ap.icao);
    }
  }

  for (const ap of live.airports) {
    if (!sandboxAirportMap.has(ap.icao)) {
      airportsRemoved.push(ap);
    }
  }

  // Group routes by origin->dest|type identity so edits to aircraft/color/remarks show as Modified
  const liveRouteById = new Map<string, RouteSector[]>();
  for (const r of live.routes) {
    const key = getRouteIdentityKey(r);
    const list = liveRouteById.get(key) || [];
    list.push(r);
    liveRouteById.set(key, list);
  }

  const sandboxRouteById = new Map<string, RouteSector[]>();
  for (const r of sandbox.routes) {
    const key = getRouteIdentityKey(r);
    const list = sandboxRouteById.get(key) || [];
    list.push(r);
    sandboxRouteById.set(key, list);
  }

  const routesAdded: RouteSector[] = [];
  const routesModified: RouteSector[] = [];
  const routesRemoved: RouteSector[] = [];
  const addedRouteSignatures = new Set<string>();
  const modifiedRouteSignatures = new Set<string>();

  for (const [idKey, sbList] of sandboxRouteById.entries()) {
    const lvList = liveRouteById.get(idKey) || [];
    const remainingLive = [...lvList];

    for (const sr of sbList) {
      const exactIdx = remainingLive.findIndex(
        (lr) => getRouteContentSignature(lr) === getRouteContentSignature(sr),
      );
      if (exactIdx >= 0) {
        remainingLive.splice(exactIdx, 1);
      } else if (remainingLive.length > 0) {
        remainingLive.shift();
        routesModified.push(sr);
        modifiedRouteSignatures.add(getRouteContentSignature(sr));
      } else {
        routesAdded.push(sr);
        addedRouteSignatures.add(getRouteContentSignature(sr));
      }
    }

    for (const leftover of remainingLive) {
      routesRemoved.push(leftover);
    }
  }

  for (const [idKey, lvList] of liveRouteById.entries()) {
    if (!sandboxRouteById.has(idKey)) {
      routesRemoved.push(...lvList);
    }
  }

  const totalChanges =
    airportsAdded.length +
    airportsModified.length +
    airportsRemoved.length +
    routesAdded.length +
    routesModified.length +
    routesRemoved.length;

  return {
    airportsAdded,
    airportsModified,
    airportsRemoved,
    routesAdded,
    routesModified,
    routesRemoved,
    totalChanges,
    addedAirportIcaos,
    modifiedAirportIcaos,
    addedRouteSignatures,
    modifiedRouteSignatures,
  };
}

/**
 * Option A (Import & Keep): Merges imported airports and routes into the current
 * Edit Mode workspace without deleting existing stations or routes.
 */
export function mergeImportedIntoWorkspace(
  current: NetworkData,
  importedAirports: Airport[] | null,
  importedRoutes: RouteSector[],
): { merged: NetworkData; addedAirports: number; addedRoutes: number } {
  const nextAirports = current.airports.map((a) => ({ ...a }));
  const existingIcaos = new Set(nextAirports.map((a) => a.icao));
  let addedAirports = 0;

  if (importedAirports) {
    for (const ap of importedAirports) {
      if (!existingIcaos.has(ap.icao)) {
        nextAirports.push({ ...ap });
        existingIcaos.add(ap.icao);
        addedAirports += 1;
      }
    }
  }

  const nextRoutes = current.routes.map((r) => ({
    ...r,
    aircraftTypes: [...r.aircraftTypes],
  }));
  const existingSigs = new Set(nextRoutes.map(getRouteContentSignature));
  let addedRoutes = 0;

  for (const r of importedRoutes) {
    if (!existingIcaos.has(r.origin) || !existingIcaos.has(r.dest) || r.origin === r.dest) {
      continue;
    }
    const sig = getRouteContentSignature(r);
    if (!existingSigs.has(sig)) {
      nextRoutes.push({ ...r, aircraftTypes: [...r.aircraftTypes] });
      existingSigs.add(sig);
      addedRoutes += 1;
    }
  }

  return {
    merged: { airports: nextAirports, routes: nextRoutes },
    addedAirports,
    addedRoutes,
  };
}

/**
 * Option B (Publish Add-Only): Keeps all existing live airports and routes untouched,
 * appending only brand-new airports and routes created in Edit Mode.
 */
export function mergeNewItemsIntoLive(
  live: NetworkData,
  edited: NetworkData,
): { merged: NetworkData; addedAirports: Airport[]; addedRoutes: RouteSector[] } {
  const nextAirports = live.airports.map((a) => ({ ...a }));
  const liveIcaos = new Set(nextAirports.map((a) => a.icao));
  const addedAirports: Airport[] = [];

  for (const ap of edited.airports) {
    if (!liveIcaos.has(ap.icao)) {
      const copy = { ...ap };
      nextAirports.push(copy);
      liveIcaos.add(copy.icao);
      addedAirports.push(copy);
    }
  }

  const nextRoutes = live.routes.map((r) => ({
    ...r,
    aircraftTypes: [...r.aircraftTypes],
  }));
  const liveRouteIdSet = new Set(live.routes.map(getRouteIdentityKey));
  const liveRouteSigSet = new Set(live.routes.map(getRouteContentSignature));
  const addedRoutes: RouteSector[] = [];

  for (const r of edited.routes) {
    if (!liveIcaos.has(r.origin) || !liveIcaos.has(r.dest) || r.origin === r.dest) {
      continue;
    }
    const idKey = getRouteIdentityKey(r);
    const sig = getRouteContentSignature(r);
    // Only add routes that are genuinely new (not already an existing live sector)
    if (!liveRouteIdSet.has(idKey) && !liveRouteSigSet.has(sig)) {
      const copy = { ...r, aircraftTypes: [...r.aircraftTypes] };
      nextRoutes.push(copy);
      liveRouteIdSet.add(idKey);
      liveRouteSigSet.add(sig);
      addedRoutes.push(copy);
    }
  }

  return {
    merged: { airports: nextAirports, routes: nextRoutes },
    addedAirports,
    addedRoutes,
  };
}

/**
 * Sample DEAT network used strictly when firebase-config.js is not configured yet
 * so users can test every map, search, inspector, sandbox, and editor improvement locally.
 */
export const SAMPLE_NETWORK_DATA: NetworkData = {
  airports: [
    {
      icao: 'LOWW',
      city: 'Vienna',
      lat: 48.1103,
      lon: 16.5697,
      continent: 'Europe',
      isHub: true,
      active: true,
      remarks: 'Primary Central European hub · Terminal 3',
    },
    {
      icao: 'EDDF',
      city: 'Frankfurt am Main',
      lat: 50.0379,
      lon: 8.5622,
      continent: 'Europe',
      isHub: true,
      active: true,
      remarks: 'Long-haul intercontinental hub',
    },
    {
      icao: 'LSZH',
      city: 'Zurich',
      lat: 47.4582,
      lon: 8.5555,
      continent: 'Europe',
      isHub: true,
      active: true,
      remarks: 'Alpine premium hub',
    },
    {
      icao: 'EGLL',
      city: 'London',
      lat: 51.47,
      lon: -0.4543,
      continent: 'Europe',
      isHub: false,
      active: true,
      remarks: 'Slot-restricted high-frequency shuttle',
    },
    {
      icao: 'LFPG',
      city: 'Paris',
      lat: 49.0097,
      lon: 2.5479,
      continent: 'Europe',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'LEMD',
      city: 'Madrid',
      lat: 40.4983,
      lon: -3.5676,
      continent: 'Europe',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'LIRF',
      city: 'Rome',
      lat: 41.8003,
      lon: 12.2389,
      continent: 'Europe',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'LGAV',
      city: 'Athens',
      lat: 37.9364,
      lon: 23.9445,
      continent: 'Europe',
      isHub: false,
      active: true,
      remarks: 'Peak summer leisure capacity',
    },
    {
      icao: 'ESSA',
      city: 'Stockholm',
      lat: 59.6519,
      lon: 17.9186,
      continent: 'Europe',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'KJFK',
      city: 'New York',
      lat: 40.6413,
      lon: -73.7781,
      continent: 'North America',
      isHub: false,
      active: true,
      remarks: 'Flagship transatlantic corridor',
    },
    {
      icao: 'KORD',
      city: 'Chicago',
      lat: 41.9742,
      lon: -87.9073,
      continent: 'North America',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'KLAX',
      city: 'Los Angeles',
      lat: 33.9416,
      lon: -118.4085,
      continent: 'North America',
      isHub: false,
      active: true,
      remarks: 'Polar routing permitted',
    },
    {
      icao: 'CYYZ',
      city: 'Toronto',
      lat: 43.6777,
      lon: -79.6248,
      continent: 'North America',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'SBGR',
      city: 'São Paulo',
      lat: -23.4356,
      lon: -46.4731,
      continent: 'South America',
      isHub: false,
      active: true,
      remarks: 'Night departure south Atlantic sector',
    },
    {
      icao: 'SAEZ',
      city: 'Buenos Aires',
      lat: -34.8222,
      lon: -58.5358,
      continent: 'South America',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'OMDB',
      city: 'Dubai',
      lat: 25.2532,
      lon: 55.3657,
      continent: 'Middle East',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'OTHH',
      city: 'Doha',
      lat: 25.2731,
      lon: 51.6081,
      continent: 'Middle East',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'HECA',
      city: 'Cairo',
      lat: 30.1219,
      lon: 31.4056,
      continent: 'Africa',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'FAOR',
      city: 'Johannesburg',
      lat: -26.1392,
      lon: 28.246,
      continent: 'Africa',
      isHub: false,
      active: true,
      remarks: 'High-altitude hot-and-high performance charts',
    },
    {
      icao: 'RJTT',
      city: 'Tokyo',
      lat: 35.5494,
      lon: 139.7798,
      continent: 'Asia',
      isHub: false,
      active: true,
      remarks: 'Haneda daytime slot pair',
    },
    {
      icao: 'WSSS',
      city: 'Singapore',
      lat: 1.3644,
      lon: 103.9915,
      continent: 'Asia',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'VTBS',
      city: 'Bangkok',
      lat: 13.69,
      lon: 100.7501,
      continent: 'Asia',
      isHub: false,
      active: true,
      remarks: 'Winter high-yield leisure sector',
    },
    {
      icao: 'RKSI',
      city: 'Seoul',
      lat: 37.4602,
      lon: 126.4407,
      continent: 'Asia',
      isHub: false,
      active: true,
      remarks: '',
    },
    {
      icao: 'YSSY',
      city: 'Sydney',
      lat: -33.9399,
      lon: 151.1753,
      continent: 'Oceania',
      isHub: false,
      active: true,
      remarks: 'Ultra-long-haul tag via Singapore',
    },
    {
      icao: 'BIKF',
      city: 'Reykjavík',
      lat: 63.985,
      lon: -22.6056,
      continent: 'Europe',
      isHub: false,
      active: false,
      remarks: 'Seasonal station — currently inactive',
    },
  ],
  routes: [
    { origin: 'LOWW', dest: 'EDDF', aircraftTypes: ['A320neo', 'A321neo'], type: 'Scheduled', remarks: 'Hub shuttle', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'LSZH', aircraftTypes: ['A220-300', 'A320neo'], type: 'Scheduled', remarks: 'Hub shuttle', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'LSZH', aircraftTypes: ['A220-300'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'EGLL', aircraftTypes: ['A320neo', 'A321neo'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'LFPG', aircraftTypes: ['A320neo'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'LIRF', aircraftTypes: ['A220-300'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'LGAV', aircraftTypes: ['A321neo'], type: 'Seasonal', remarks: 'Summer daily', color: '#d97706' },
    { origin: 'LOWW', dest: 'ESSA', aircraftTypes: ['A220-300'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'KJFK', aircraftTypes: ['B787-9'], type: 'Scheduled', remarks: 'Daily flagship', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'KORD', aircraftTypes: ['B787-9'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'CYYZ', aircraftTypes: ['B787-9'], type: 'Seasonal', remarks: '', color: '#d97706' },
    { origin: 'LOWW', dest: 'OMDB', aircraftTypes: ['A321XLR', 'B787-9'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'HECA', aircraftTypes: ['A320neo'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'VTBS', aircraftTypes: ['B787-9'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'RJTT', aircraftTypes: ['A350-900'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'EGLL', aircraftTypes: ['A321neo'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'LEMD', aircraftTypes: ['A320neo'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'KJFK', aircraftTypes: ['A350-900', 'B787-9'], type: 'Scheduled', remarks: '2x daily', color: '#EE1C25' },
    { origin: 'KJFK', dest: 'EDDF', aircraftTypes: ['B777F'], type: 'Cargo', remarks: 'Dedicated overnight freighter', color: '#0284c7' },
    { origin: 'EDDF', dest: 'KLAX', aircraftTypes: ['A350-900'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'SBGR', aircraftTypes: ['A350-900'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'SAEZ', aircraftTypes: ['B787-9'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'FAOR', aircraftTypes: ['A350-900'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'WSSS', aircraftTypes: ['A350-900'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'EDDF', dest: 'RKSI', aircraftTypes: ['B787-9'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LSZH', dest: 'LFPG', aircraftTypes: ['A220-300'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LSZH', dest: 'LEMD', aircraftTypes: ['A220-300'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LSZH', dest: 'KJFK', aircraftTypes: ['A350-900'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LSZH', dest: 'OTHH', aircraftTypes: ['A321XLR'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'LSZH', dest: 'WSSS', aircraftTypes: ['A350-900'], type: 'Scheduled', remarks: '', color: '#EE1C25' },
    { origin: 'WSSS', dest: 'YSSY', aircraftTypes: ['A350-900'], type: 'Scheduled', remarks: 'Fifth-freedom continuation', color: '#EE1C25' },
    { origin: 'LOWW', dest: 'BIKF', aircraftTypes: ['A320neo'], type: 'Charter', remarks: 'Inactive station charter', color: '#7c3aed' },
  ],
};
