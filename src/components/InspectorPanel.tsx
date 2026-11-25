import React from 'react';
import { Crosshair, X } from 'lucide-react';
import { Airport, DEFAULT_ROUTE_COLOR, RouteSector } from '../types/network';
import { calculateGreatCircleNm, formatCityName } from '../utils/networkUtils';

interface InspectorPanelProps {
  selectedAirport: Airport | null;
  selectedRoute: RouteSector | null;
  allAirports: Airport[];
  allRoutes: RouteSector[];
  onSelectAirport: (airport: Airport) => void;
  onSelectRoute: (route: RouteSector, routeKey: string) => void;
  onFocusAirport: (airport: Airport) => void;
  onClose: () => void;
}

export function InspectorPanel({
  selectedAirport,
  selectedRoute,
  allAirports,
  allRoutes,
  onSelectAirport,
  onSelectRoute,
  onFocusAirport,
  onClose,
}: InspectorPanelProps) {
  if (!selectedAirport && !selectedRoute) return null;

  const airportMap = new Map(allAirports.map((a) => [a.icao, a]));

  if (selectedAirport) {
    const connected = allRoutes
      .map((route, idx) => ({ route, idx }))
      .filter(
        ({ route }) =>
          route.origin === selectedAirport.icao || route.dest === selectedAirport.icao,
      );

    return (
      <aside
        aria-live="polite"
        aria-label="Station profile"
        className="fixed bottom-14 left-3 right-3 sm:right-auto sm:bottom-auto sm:top-16 sm:left-4 sm:w-[328px] max-h-[46vh] sm:max-h-[calc(100vh-124px)] overflow-y-auto z-30 rounded border border-[var(--border-strong)] bg-[var(--surface)]/95 backdrop-blur-sm p-4 flex flex-col gap-3 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10.5px] font-medium text-[var(--ink-muted)]">
              <span className={selectedAirport.isHub ? 'text-[#EE1C25] font-semibold' : ''}>
                {selectedAirport.isHub ? 'Hub Station' : 'Network Station'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{selectedAirport.active === false ? 'Inactive' : 'Active'}</span>
            </div>
            <h2 className="mt-1 text-base font-bold text-[var(--ink)] truncate">
              {formatCityName(selectedAirport.city)}{' '}
              <span className="font-mono text-xs font-semibold text-[var(--ink-muted)]">
                ({selectedAirport.icao})
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onFocusAirport(selectedAirport)}
              title="Center map on station"
              aria-label="Center map on station"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-l border-[var(--border)] rounded overflow-hidden">
          <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">Region</div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)]">
              {selectedAirport.continent}
            </div>
          </div>
          <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">Sectors</div>
            <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
              {connected.length}
            </div>
          </div>
          <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">Latitude</div>
            <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
              {selectedAirport.lat.toFixed(4)}°
            </div>
          </div>
          <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">Longitude</div>
            <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
              {selectedAirport.lon.toFixed(4)}°
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-[var(--ink-muted)]">
            {connected.length > 0
              ? 'Connected flight sectors:'
              : 'No sectors connected to this station.'}
          </p>
          <div className="flex flex-col gap-1.5">
            {connected.map(({ route, idx }) => {
              const peerCode =
                route.origin === selectedAirport.icao ? route.dest : route.origin;
              const peer = airportMap.get(peerCode);
              const direction = route.origin === selectedAirport.icao ? '→' : '←';
              return (
                <button
                  key={`${route.origin}-${route.dest}-${idx}`}
                  type="button"
                  onClick={() => onSelectRoute(route, `${route.origin}->${route.dest}#${idx}`)}
                  className="flex w-full items-center justify-between gap-2 rounded border border-[var(--border)] px-2.5 py-2 text-left text-xs hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)] transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: route.color || DEFAULT_ROUTE_COLOR }}
                    />
                    <span className="truncate font-semibold text-[var(--ink)]">
                      {direction} {peer ? formatCityName(peer.city) : peerCode}
                    </span>
                    <span className="font-mono text-[10.5px] text-[var(--ink-muted)] shrink-0">
                      {peerCode}
                    </span>
                  </span>
                  <span className="font-mono text-[10.5px] text-[var(--ink-muted)] truncate max-w-[110px] shrink-0">
                    {route.aircraftTypes.join(', ')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    );
  }

  // Flight Sector Inspector
  if (selectedRoute) {
    const src = airportMap.get(selectedRoute.origin);
    const dst = airportMap.get(selectedRoute.dest);
    const distNm = src && dst ? calculateGreatCircleNm(src, dst) : 0;

    return (
      <aside
        aria-live="polite"
        aria-label="Flight sector details"
        className="fixed bottom-14 left-3 right-3 sm:right-auto sm:bottom-auto sm:top-16 sm:left-4 sm:w-[328px] max-h-[46vh] sm:max-h-[calc(100vh-124px)] overflow-y-auto z-30 rounded border border-[var(--border-strong)] bg-[var(--surface)]/95 backdrop-blur-sm p-4 flex flex-col gap-3 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="min-w-0">
            <div className="font-mono text-[10.5px] font-semibold text-[#EE1C25]">
              Flight Sector
            </div>
            <h2 className="mt-1 text-base font-bold text-[var(--ink)]">
              {src ? formatCityName(src.city) : selectedRoute.origin} →{' '}
              {dst ? formatCityName(dst.city) : selectedRoute.dest}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)] shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 border-t border-l border-[var(--border)] rounded overflow-hidden">
          <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">City Pair</div>
            <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
              {selectedRoute.origin}–{selectedRoute.dest}
            </div>
          </div>
          <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">Type</div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)]">
              {selectedRoute.type}
            </div>
          </div>
          <div className="col-span-2 border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">Aircraft Fleet</div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink)]">
              {selectedRoute.aircraftTypes.join(' · ')}
            </div>
          </div>
          <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">Great Circle</div>
            <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
              {distNm.toLocaleString()} NM
            </div>
          </div>
          <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-2">
            <div className="font-mono text-[10px] text-[var(--ink-muted)]">Sector Color</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-block h-3.5 w-6 rounded-sm border border-[var(--border-strong)]"
                style={{ backgroundColor: selectedRoute.color || DEFAULT_ROUTE_COLOR }}
              />
              <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
                {selectedRoute.color || DEFAULT_ROUTE_COLOR}
              </span>
            </div>
          </div>
        </div>

        {src && dst && (
          <p className="font-mono text-[11px] text-[var(--ink-muted)]">
            {src.continent} → {dst.continent}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          {[src, dst].filter((ap): ap is Airport => Boolean(ap)).map((ap, i) => (
            <button
              key={`${ap.icao}-${i}`}
              type="button"
              onClick={() => onSelectAirport(ap)}
              className="flex w-full items-center justify-between gap-2 rounded border border-[var(--border)] px-2.5 py-2 text-left text-xs hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)] transition-colors"
            >
              <span className="truncate text-[var(--ink)]">
                <span className="text-[var(--ink-muted)] mr-1.5">
                  {i === 0 ? 'Origin:' : 'Destination:'}
                </span>
                <strong>{formatCityName(ap.city)}</strong>{' '}
                <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
                  ({ap.icao})
                </span>
              </span>
              <span className="font-mono text-[10.5px] text-[var(--ink-muted)] shrink-0">
                {ap.continent}
              </span>
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return null;
}
