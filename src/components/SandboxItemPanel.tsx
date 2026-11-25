import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import {
  Airport,
  CONTINENTS,
  DEFAULT_ROUTE_COLOR,
  RouteSector,
  SANDBOX_COLOR_PRESETS,
} from '../types/network';
import {
  calculateGreatCircleNm,
  formatCityName,
  isValidHexColor,
  isValidIcao,
  parseAircraftList,
} from '../utils/networkUtils';

export type SandboxSelection =
  | { kind: 'new-airport'; lat: number; lon: number; continent: string }
  | { kind: 'airport'; icao: string }
  | { kind: 'route'; routeIndex: number };

interface SandboxItemPanelProps {
  selection: SandboxSelection | null;
  sandboxAirports: Airport[];
  sandboxRoutes: RouteSector[];
  liveCounts: Map<string, number>;
  sandboxCounts: Map<string, number>;
  addedAirportIcaos: Set<string>;
  modifiedAirportIcaos: Set<string>;
  addedRouteSignatures: Set<string>;
  modifiedRouteSignatures: Set<string>;
  routeSignatureFn: (r: RouteSector) => string;
  onSaveAirport: (airport: Airport, previousIcao?: string) => void;
  onDeleteAirport: (icao: string) => void;
  onSaveRoute: (route: RouteSector, routeIndex: number) => void;
  onDeleteRoute: (routeIndex: number) => void;
  onSelectRouteIndex: (idx: number) => void;
  onSelectAirportIcao: (icao: string) => void;
  onClose: () => void;
}

export function SandboxItemPanel({
  selection,
  sandboxAirports,
  sandboxRoutes,
  liveCounts,
  sandboxCounts,
  addedAirportIcaos,
  modifiedAirportIcaos,
  addedRouteSignatures,
  modifiedRouteSignatures,
  routeSignatureFn,
  onSaveAirport,
  onDeleteAirport,
  onSaveRoute,
  onDeleteRoute,
  onSelectRouteIndex,
  onSelectAirportIcao,
  onClose,
}: SandboxItemPanelProps) {
  const [error, setError] = useState('');

  // Airport form state
  const [city, setCity] = useState('');
  const [icao, setIcao] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [continent, setContinent] = useState('Europe');
  const [role, setRole] = useState<'dest' | 'hub'>('dest');
  const [active, setActive] = useState<'true' | 'false'>('true');
  const [remarks, setRemarks] = useState('');

  // Route form state
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');
  const [aircraft, setAircraft] = useState('A320neo');
  const [routeType, setRouteType] = useState('Proposed');
  const [color, setColor] = useState(DEFAULT_ROUTE_COLOR);
  const [routeRemarks, setRouteRemarks] = useState('');

  const airportMap = useMemo(
    () => new Map(sandboxAirports.map((a) => [a.icao, a])),
    [sandboxAirports],
  );

  const sortedAirports = useMemo(
    () =>
      [...sandboxAirports].sort((a, b) =>
        formatCityName(a.city).localeCompare(formatCityName(b.city)),
      ),
    [sandboxAirports],
  );

  useEffect(() => {
    setError('');
    if (!selection) return;

    if (selection.kind === 'new-airport') {
      setCity('');
      setIcao('');
      setLat(String(selection.lat));
      setLon(String(selection.lon));
      setContinent(selection.continent);
      setRole('dest');
      setActive('true');
      setRemarks('');
    } else if (selection.kind === 'airport') {
      const ap = airportMap.get(selection.icao);
      if (ap) {
        setCity(formatCityName(ap.city));
        setIcao(ap.icao);
        setLat(String(ap.lat));
        setLon(String(ap.lon));
        setContinent(ap.continent);
        setRole(ap.isHub ? 'hub' : 'dest');
        setActive(ap.active === false ? 'false' : 'true');
        setRemarks(ap.remarks || '');
      }
    } else if (selection.kind === 'route') {
      const r = sandboxRoutes[selection.routeIndex];
      if (r) {
        setOrigin(r.origin);
        setDest(r.dest);
        setAircraft(r.aircraftTypes.join(', '));
        setRouteType(r.type || 'Scheduled');
        setColor(r.color || DEFAULT_ROUTE_COLOR);
        setRouteRemarks(r.remarks || '');
      }
    }
  }, [selection, airportMap, sandboxRoutes]);

  if (!selection) return null;

  // AIRPORT CREATE / EDIT VIEW
  if (selection.kind === 'new-airport' || selection.kind === 'airport') {
    const isNew = selection.kind === 'new-airport';
    const existingAp = !isNew ? airportMap.get(selection.icao) : null;
    if (!isNew && !existingAp) return null;

    const statusLabel = isNew
      ? 'New Local Station'
      : addedAirportIcaos.has(selection.icao)
        ? 'Added in Edit Mode'
        : modifiedAirportIcaos.has(selection.icao)
          ? 'Modified vs. Live'
          : 'Live Station (Local Copy)';

    const sbCount = !isNew ? sandboxCounts.get(selection.icao) || 0 : 0;
    const lvCount = !isNew ? liveCounts.get(selection.icao) || 0 : 0;
    const delta = sbCount - lvCount;

    const connected = !isNew
      ? sandboxRoutes
          .map((r, idx) => ({ r, idx }))
          .filter(({ r }) => r.origin === selection.icao || r.dest === selection.icao)
      : [];

    const handleAirportSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      const cleanCity = city.trim();
      const cleanIcao = icao.trim().toUpperCase();
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);

      if (!cleanCity) {
        setError('Enter a city name.');
        return;
      }
      if (!isValidIcao(cleanIcao)) {
        setError('Code must be 3–4 alphanumeric characters.');
        return;
      }
      if (
        Number.isNaN(latNum) ||
        latNum < -85 ||
        latNum > 85 ||
        Number.isNaN(lonNum) ||
        lonNum < -180 ||
        lonNum > 180
      ) {
        setError('Coordinates out of range (Lat -85..85, Lon -180..180).');
        return;
      }
      if ((isNew || cleanIcao !== selection.icao) && airportMap.has(cleanIcao)) {
        setError(`Station code ${cleanIcao} already exists in Edit Mode.`);
        return;
      }

      onSaveAirport(
        {
          icao: cleanIcao,
          city: cleanCity.slice(0, 80),
          lat: Number(latNum.toFixed(4)),
          lon: Number(lonNum.toFixed(4)),
          continent,
          isHub: role === 'hub',
          active: active === 'true',
          remarks: remarks.trim().slice(0, 300),
        },
        isNew ? undefined : selection.icao,
      );
    };

    return (
      <aside
        aria-label="Edit Mode station editor"
        className="fixed bottom-28 left-3 right-3 sm:right-auto sm:bottom-auto sm:top-24 sm:left-4 sm:w-[344px] max-h-[54vh] sm:max-h-[calc(100vh-190px)] overflow-y-auto z-30 rounded border border-amber-500/80 bg-[var(--surface)]/95 backdrop-blur-sm p-4 flex flex-col gap-3 shadow-md"
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-2.5">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {statusLabel}
            </div>
            <h2 className="mt-0.5 text-sm font-bold text-[var(--ink)] truncate">
              {isNew
                ? 'Add Local Airport'
                : `${formatCityName(existingAp!.city)} (${existingAp!.icao})`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {!isNew && (
          <div className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 font-mono text-[11px] tabular-nums">
            <span className="text-[var(--ink-muted)]">Draft sectors</span>
            <span className="font-semibold text-[var(--ink)]">
              {sbCount}{' '}
              <span
                className={
                  delta > 0
                    ? 'text-[var(--ok)]'
                    : delta < 0
                      ? 'text-[var(--err)]'
                      : 'text-[var(--ink-muted)]'
                }
              >
                ({delta > 0 ? `+${delta}` : delta === 0 ? `live: ${lvCount}` : delta})
              </span>
            </span>
          </div>
        )}

        <form onSubmit={handleAirportSubmit} className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2 space-y-1">
            <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              City Name
            </label>
            <input
              type="text"
              required
              autoFocus={isNew}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Lisbon"
              className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--ink)] focus:border-amber-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              ICAO / IATA
            </label>
            <input
              type="text"
              required
              maxLength={4}
              value={icao}
              onChange={(e) => setIcao(e.target.value.toUpperCase())}
              placeholder="LPPT"
              className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-xs uppercase text-[var(--ink)] focus:border-amber-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              Region
            </label>
            <select
              value={continent}
              onChange={(e) => setContinent(e.target.value)}
              className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-amber-500"
            >
              {CONTINENTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              Latitude
            </label>
            <input
              type="number"
              step="0.0001"
              min={-85}
              max={85}
              required
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-xs tabular-nums text-[var(--ink)] focus:border-amber-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              Longitude
            </label>
            <input
              type="number"
              step="0.0001"
              min={-180}
              max={180}
              required
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-xs tabular-nums text-[var(--ink)] focus:border-amber-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'dest' | 'hub')}
              className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-amber-500"
            >
              <option value="dest">Station</option>
              <option value="hub">Hub</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              Status
            </label>
            <select
              value={active}
              onChange={(e) => setActive(e.target.value as 'true' | 'false')}
              className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-amber-500"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              Internal Remarks
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Station notes, slots, terminal..."
              className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--ink)] focus:border-amber-500"
            />
          </div>

          {error && (
            <div className="col-span-2 font-mono text-[11px] text-[var(--err)]">{error}</div>
          )}

          <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
            {!isNew ? (
              <button
                type="button"
                onClick={() => onDeleteAirport(selection.icao)}
                title={
                  connected.length > 0
                    ? `Also removes ${connected.length} connected route(s) locally`
                    : 'Remove station locally'
                }
                className="inline-flex h-8.5 items-center gap-1.5 rounded border border-red-500/40 px-2.5 font-mono text-[11px] font-medium text-[var(--err)] hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete{connected.length > 0 ? ` (-${connected.length})` : ''}</span>
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="h-8.5 rounded bg-amber-600 px-3.5 font-mono text-[11px] font-semibold text-white hover:bg-amber-700"
            >
              {isNew ? 'Add Airport' : 'Save Changes'}
            </button>
          </div>
        </form>

        {!isNew && connected.length > 0 && (
          <div className="border-t border-[var(--border)] pt-2.5 space-y-1.5">
            <div className="font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
              Connected Sectors ({connected.length})
            </div>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {connected.map(({ r, idx }) => {
                const peerCode = r.origin === selection.icao ? r.dest : r.origin;
                const peer = airportMap.get(peerCode);
                return (
                  <button
                    key={`${r.origin}-${r.dest}-${idx}`}
                    type="button"
                    onClick={() => onSelectRouteIndex(idx)}
                    className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-2.5 py-1.5 text-left text-xs hover:bg-[var(--surface-alt)]"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: r.color || DEFAULT_ROUTE_COLOR }}
                      />
                      <span className="font-medium text-[var(--ink)] truncate">
                        {r.origin === selection.icao ? '→' : '←'}{' '}
                        {peer ? formatCityName(peer.city) : peerCode}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-muted)] shrink-0">
                      {r.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    );
  }

  // ROUTE SECTOR EDIT VIEW
  const route = sandboxRoutes[selection.routeIndex];
  if (!route) return null;

  const src = airportMap.get(route.origin);
  const dst = airportMap.get(route.dest);
  const distNm = src && dst ? calculateGreatCircleNm(src, dst) : 0;
  const sig = routeSignatureFn(route);
  const routeDiffLabel = addedRouteSignatures.has(sig)
    ? 'Added in Edit Mode'
    : modifiedRouteSignatures.has(sig)
      ? 'Modified vs. Live'
      : 'Live Sector (Local Copy)';

  const handleRouteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!origin || !dest || origin === dest) {
      setError('Origin and destination must be different stations.');
      return;
    }
    const list = parseAircraftList(aircraft);
    if (!list.length) {
      setError('Enter at least one aircraft type.');
      return;
    }
    onSaveRoute(
      {
        origin,
        dest,
        aircraftTypes: list,
        type: routeType.trim().slice(0, 40) || 'Scheduled',
        color: isValidHexColor(color) ? color : DEFAULT_ROUTE_COLOR,
        remarks: routeRemarks.trim().slice(0, 300),
      },
      selection.routeIndex,
    );
  };

  return (
    <aside
      aria-label="Edit Mode route editor"
      className="fixed bottom-28 left-3 right-3 sm:right-auto sm:bottom-auto sm:top-24 sm:left-4 sm:w-[344px] max-h-[54vh] sm:max-h-[calc(100vh-190px)] overflow-y-auto z-30 rounded border border-amber-500/80 bg-[var(--surface)]/95 backdrop-blur-sm p-4 flex flex-col gap-3 shadow-md"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <span>{routeDiffLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums text-[var(--ink-muted)]">
              {distNm.toLocaleString()} NM
            </span>
          </div>
          <h2 className="mt-0.5 text-sm font-bold text-[var(--ink)] truncate">
            {src ? formatCityName(src.city) : route.origin} →{' '}
            {dst ? formatCityName(dst.city) : route.dest}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form onSubmit={handleRouteSubmit} className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            Origin
          </label>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-amber-500"
          >
            {sortedAirports.map((a) => (
              <option key={a.icao} value={a.icao}>
                {formatCityName(a.city)} ({a.icao})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            Destination
          </label>
          <select
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-amber-500"
          >
            {sortedAirports.map((a) => (
              <option key={a.icao} value={a.icao}>
                {formatCityName(a.city)} ({a.icao})
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 space-y-1">
          <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            Aircraft (comma-separated)
          </label>
          <input
            type="text"
            required
            value={aircraft}
            onChange={(e) => setAircraft(e.target.value)}
            placeholder="A320neo, B787-9"
            className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-xs text-[var(--ink)] focus:border-amber-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            Sector Type
          </label>
          <input
            type="text"
            required
            value={routeType}
            onChange={(e) => setRouteType(e.target.value)}
            placeholder="Scheduled"
            className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--ink)] focus:border-amber-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            Color
          </label>
          <div className="flex h-8.5 items-center gap-1.5">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-[var(--border-strong)] bg-transparent p-0.5 shrink-0"
            />
            <div className="flex items-center gap-1">
              {SANDBOX_COLOR_PRESETS.slice(0, 4).map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => setColor(p.hex)}
                  title={p.label}
                  className="h-4 w-4 rounded-sm border border-black/20"
                  style={{ backgroundColor: p.hex }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-2 space-y-1">
          <label className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            Internal Remarks
          </label>
          <input
            type="text"
            value={routeRemarks}
            onChange={(e) => setRouteRemarks(e.target.value)}
            placeholder="Frequency, rights, seasonality..."
            className="h-8.5 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--ink)] focus:border-amber-500"
          />
        </div>

        {error && (
          <div className="col-span-2 font-mono text-[11px] text-[var(--err)]">{error}</div>
        )}

        <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => onDeleteRoute(selection.routeIndex)}
            className="inline-flex h-8.5 items-center gap-1.5 rounded border border-red-500/40 px-2.5 font-mono text-[11px] font-medium text-[var(--err)] hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Route</span>
          </button>
          <button
            type="submit"
            className="h-8.5 rounded bg-amber-600 px-3.5 font-mono text-[11px] font-semibold text-white hover:bg-amber-700"
          >
            Update Route
          </button>
        </div>
      </form>

      {/* Quick jump to edit origin / dest airport */}
      <div className="border-t border-[var(--border)] pt-2.5 flex items-center gap-2">
        {src && (
          <button
            type="button"
            onClick={() => onSelectAirportIcao(src.icao)}
            className="flex-1 truncate rounded border border-[var(--border)] px-2 py-1.5 font-mono text-[10.5px] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)]"
          >
            Edit {src.icao}
          </button>
        )}
        {dst && (
          <button
            type="button"
            onClick={() => onSelectAirportIcao(dst.icao)}
            className="flex-1 truncate rounded border border-[var(--border)] px-2 py-1.5 font-mono text-[10.5px] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)]"
          >
            Edit {dst.icao}
          </button>
        )}
      </div>
    </aside>
  );
}
