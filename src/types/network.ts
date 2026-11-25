export const CONTINENTS = [
  'Europe',
  'North America',
  'South America',
  'Asia',
  'Middle East',
  'Africa',
  'Oceania',
] as const;

export type Continent = (typeof CONTINENTS)[number];

export interface Airport {
  icao: string;
  city: string;
  lat: number;
  lon: number;
  continent: string;
  isHub: boolean;
  active: boolean;
  remarks: string;
}

export interface RouteSector {
  origin: string;
  dest: string;
  aircraftTypes: string[];
  type: string;
  remarks: string;
  color: string;
}

export interface NetworkData {
  airports: Airport[];
  routes: RouteSector[];
}

export interface SandboxRoute {
  origin: string;
  dest: string;
  color: string;
}

export type SandboxTool = 'draw' | 'select' | 'add-airport' | 'erase';

export interface AdminOverlayState {
  showLiveRoutes: boolean;
  showSandboxRoutes: boolean;
  showAirportCounts: boolean;
  showAllAirports: boolean;
}

export interface NetworkDiffSummary {
  airportsAdded: Airport[];
  airportsModified: Airport[];
  airportsRemoved: Airport[];
  routesAdded: RouteSector[];
  routesModified: RouteSector[];
  routesRemoved: RouteSector[];
  totalChanges: number;
  addedAirportIcaos: Set<string>;
  modifiedAirportIcaos: Set<string>;
  addedRouteSignatures: Set<string>;
  modifiedRouteSignatures: Set<string>;
}

export interface FilterState {
  hub: string;
  continent: string;
  type: string;
  aircraftTypes: Set<string>;
}

export type SyncState = 'synced' | 'saving' | 'local' | 'preview' | 'error';

export interface ToastMessage {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

export interface FirebaseWebConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export const DEFAULT_ROUTE_COLOR = '#EE1C25';
export const HIGHLIGHT_ROUTE_COLOR = '#FF131B';

export const SANDBOX_COLOR_PRESETS = [
  { hex: '#EE1C25', label: 'DEAT Red' },
  { hex: '#0284c7', label: 'Ocean Blue' },
  { hex: '#15803d', label: 'Emerald Green' },
  { hex: '#d97706', label: 'Signal Amber' },
  { hex: '#7c3aed', label: 'Violet' },
] as const;

declare global {
  interface Window {
    FIREBASE_CONFIG?: FirebaseWebConfig;
  }
}
