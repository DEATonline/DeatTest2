import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Filter,
  PenTool,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { Airport, CONTINENTS, FilterState, SyncState } from '../types/network';
import { formatCityName } from '../utils/networkUtils';

interface TopBarProps {
  airports: Airport[];
  hubs: Airport[];
  routeTypes: string[];
  aircraftTypes: string[];
  activeAirportCount: number;
  totalAirportCount: number;
  routeCount: number;
  sandboxMode: boolean;
  sandboxRouteCount: number;
  isAdminUnlocked: boolean;
  syncState: SyncState;
  syncText: string;
  filters: FilterState;
  onChangeFilter: (patch: Partial<FilterState>) => void;
  onResetFilters: () => void;
  onJumpToAirport: (airport: Airport) => void;
  onToggleSandbox: () => void;
  onOpenEditor: () => void;
}

export function TopBar({
  airports,
  hubs,
  routeTypes,
  aircraftTypes,
  activeAirportCount,
  totalAirportCount,
  routeCount,
  sandboxMode,
  sandboxRouteCount,
  isAdminUnlocked,
  syncState,
  syncText,
  filters,
  onChangeFilter,
  onResetFilters,
  onJumpToAirport,
  onToggleSandbox,
  onOpenEditor,
}: TopBarProps) {
  const [fleetOpen, setFleetOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0);

  const fleetWrapRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Close popovers on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (fleetWrapRef.current && !fleetWrapRef.current.contains(target)) {
        setFleetOpen(false);
      }
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Cmd/Ctrl+K shortcut to focus airport quick search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return airports
      .filter((a) => a.active !== false)
      .filter(
        (a) =>
          a.icao.toLowerCase().includes(q) ||
          formatCityName(a.city).toLowerCase().includes(q) ||
          a.continent.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const aExact = a.icao.toLowerCase().startsWith(q) ? 0 : 1;
        const bExact = b.icao.toLowerCase().startsWith(q) ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return formatCityName(a.city).localeCompare(formatCityName(b.city));
      })
      .slice(0, 8);
  }, [airports, searchQuery]);

  const activeFilterCount =
    (filters.hub !== 'ALL' ? 1 : 0) +
    (filters.continent !== 'ALL' ? 1 : 0) +
    (filters.type !== 'ALL' ? 1 : 0) +
    (filters.aircraftTypes.size > 0 ? 1 : 0);

  const fleetLabel =
    filters.aircraftTypes.size === 0
      ? 'Fleet: All'
      : filters.aircraftTypes.size === 1
        ? `Fleet: ${[...filters.aircraftTypes][0]}`
        : `Fleet (${filters.aircraftTypes.size})`;

  const toggleAircraft = (ac: string) => {
    const next = new Set(filters.aircraftTypes);
    if (next.has(ac)) next.delete(ac);
    else next.add(ac);
    onChangeFilter({ aircraftTypes: next });
  };

  const handleSelectSearchResult = (airport: Airport) => {
    onJumpToAirport(airport);
    setSearchQuery('');
    setSearchOpen(false);
    setMobileDrawerOpen(false);
  };

  const syncColorClass =
    syncState === 'synced'
      ? 'text-[var(--ok)]'
      : syncState === 'saving'
        ? 'text-[var(--warn)]'
        : syncState === 'local'
          ? 'text-amber-600 dark:text-amber-400'
          : syncState === 'preview'
            ? 'text-[var(--ink-muted)]'
            : 'text-[var(--err)]';

  const syncDotClass =
    syncState === 'synced'
      ? 'bg-[var(--ok)]'
      : syncState === 'saving'
        ? 'bg-[var(--warn)]'
        : syncState === 'local'
          ? 'bg-amber-500'
          : syncState === 'preview'
            ? 'bg-[var(--ink-muted)]'
            : 'bg-[var(--err)]';

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-30 h-13 border-b bg-[var(--surface)]/95 backdrop-blur-sm transition-colors ${
          sandboxMode ? 'border-amber-500' : 'border-[var(--border)]'
        }`}
      >
        <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-4">
          {/* Left Zone: DEAT Brand + Live Telemetry */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <div className="flex items-center gap-2 rounded bg-[#EE1C25] px-2.5 py-1.5 text-white shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 120 100"
                fill="none"
                width="18"
                height="15"
                aria-hidden="true"
              >
                <circle cx="64" cy="52" r="28" stroke="#FFFFFF" strokeWidth="8.5" />
                <path
                  d="M18 14C33 33 57 44 95 47C69 54 53 67 39 86C46 65 39 45 18 14Z"
                  fill="#FFFFFF"
                />
              </svg>
              <span className="font-extrabold italic tracking-wider text-sm leading-none whitespace-nowrap">
                DEAT
              </span>
            </div>

            <div className="hidden md:flex flex-col min-w-0">
              <span className="text-[11px] font-bold italic tracking-wide text-[var(--ink-secondary)] leading-tight whitespace-nowrap">
                {sandboxMode ? 'Edit Mode · Local Only' : 'Global Passenger Network'}
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-[var(--ink-muted)] leading-tight mt-0.5 whitespace-nowrap">
                {sandboxMode
                  ? `${activeAirportCount} stations · ${sandboxRouteCount} local routes`
                  : `${hubs.length} ${hubs.length === 1 ? 'hub' : 'hubs'} · ${activeAirportCount}/${totalAirportCount} active · ${routeCount} sectors`}
              </span>
            </div>

            <div
              className="hidden sm:flex items-center gap-1.5 border-l border-[var(--border)] pl-3 font-mono text-[10.5px] font-medium whitespace-nowrap"
              title="Database connection status"
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${syncDotClass}`} />
              <span className={syncColorClass}>{syncText}</span>
            </div>
          </div>

          {/* Right Zone: Search + Desktop Filters + Admin Actions */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Quick Airport Search */}
            <div ref={searchWrapRef} className="relative w-36 sm:w-48 xl:w-56">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ink-muted)]"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                  setSearchHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false);
                    searchInputRef.current?.blur();
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSearchHighlightIdx((prev) =>
                      searchResults.length ? (prev + 1) % searchResults.length : 0,
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSearchHighlightIdx((prev) =>
                      searchResults.length
                        ? (prev - 1 + searchResults.length) % searchResults.length
                        : 0,
                    );
                  } else if (e.key === 'Enter' && searchResults[searchHighlightIdx]) {
                    e.preventDefault();
                    handleSelectSearchResult(searchResults[searchHighlightIdx]);
                  }
                }}
                placeholder="Search airport..."
                aria-label="Search airport by city or ICAO code"
                className="h-9 w-full rounded border border-[var(--border)] bg-[var(--surface-alt)] pl-8 pr-7 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--deat-red)] focus:bg-[var(--surface)]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="pointer-events-none hidden xl:inline-block absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--ink-muted)]">
                  ⌘K
                </span>
              )}

              {searchOpen && searchQuery.trim().length > 0 && (
                <div
                  role="listbox"
                  className="absolute right-0 top-full mt-1.5 w-64 max-h-72 overflow-y-auto rounded border border-[var(--border-strong)] bg-[var(--surface)] py-1 shadow-md z-50"
                >
                  {searchResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[var(--ink-muted)]">
                      No matching active station
                    </div>
                  ) : (
                    searchResults.map((ap, idx) => (
                      <button
                        key={ap.icao}
                        type="button"
                        role="option"
                        aria-selected={idx === searchHighlightIdx}
                        onMouseEnter={() => setSearchHighlightIdx(idx)}
                        onClick={() => handleSelectSearchResult(ap)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
                          idx === searchHighlightIdx
                            ? 'bg-[var(--surface-alt)] text-[var(--ink)]'
                            : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)]'
                        }`}
                      >
                        <span className="truncate font-medium">
                          {formatCityName(ap.city)}
                          {ap.isHub && (
                            <span className="ml-1.5 font-mono text-[10px] font-semibold text-[#EE1C25]">
                              Hub
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)] shrink-0">
                          {ap.icao}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Desktop Inline Filters (>= lg) */}
            <div className="hidden lg:flex items-center rounded border border-[var(--border)] bg-[var(--surface)] h-9">
              <select
                value={filters.hub}
                onChange={(e) => onChangeFilter({ hub: e.target.value })}
                aria-label="Filter by hub"
                className="h-full border-r border-[var(--border)] bg-transparent px-2.5 font-mono text-[11px] text-[var(--ink)] hover:bg-[var(--surface-alt)] cursor-pointer outline-none"
              >
                <option value="ALL" className="bg-[var(--surface)] text-[var(--ink)]">
                  Hub: All ({hubs.length})
                </option>
                {hubs.map((h) => (
                  <option
                    key={h.icao}
                    value={h.icao}
                    className="bg-[var(--surface)] text-[var(--ink)]"
                  >
                    {formatCityName(h.city)} ({h.icao})
                  </option>
                ))}
              </select>

              <select
                value={filters.continent}
                onChange={(e) => onChangeFilter({ continent: e.target.value })}
                aria-label="Filter by region"
                className="h-full border-r border-[var(--border)] bg-transparent px-2.5 font-mono text-[11px] text-[var(--ink)] hover:bg-[var(--surface-alt)] cursor-pointer outline-none"
              >
                <option value="ALL" className="bg-[var(--surface)] text-[var(--ink)]">
                  Region: All
                </option>
                {CONTINENTS.map((c) => (
                  <option
                    key={c}
                    value={c}
                    className="bg-[var(--surface)] text-[var(--ink)]"
                  >
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={filters.type}
                onChange={(e) => onChangeFilter({ type: e.target.value })}
                aria-label="Filter by route type"
                className="h-full border-r border-[var(--border)] bg-transparent px-2.5 font-mono text-[11px] text-[var(--ink)] hover:bg-[var(--surface-alt)] cursor-pointer outline-none"
              >
                <option value="ALL" className="bg-[var(--surface)] text-[var(--ink)]">
                  Type: All
                </option>
                {routeTypes.map((t) => (
                  <option
                    key={t}
                    value={t}
                    className="bg-[var(--surface)] text-[var(--ink)]"
                  >
                    {t}
                  </option>
                ))}
              </select>

              <div ref={fleetWrapRef} className="relative h-full">
                <button
                  type="button"
                  onClick={() => setFleetOpen((o) => !o)}
                  aria-expanded={fleetOpen}
                  className="flex h-full items-center gap-1.5 px-2.5 font-mono text-[11px] text-[var(--ink)] hover:bg-[var(--surface-alt)] whitespace-nowrap"
                >
                  <span>{fleetLabel}</span>
                  <ChevronDown className="h-3 w-3 text-[var(--ink-muted)]" />
                </button>

                {fleetOpen && (
                  <div
                    role="group"
                    aria-label="Toggle aircraft types"
                    className="absolute right-0 top-full mt-1.5 min-w-[216px] max-h-64 overflow-y-auto rounded border border-[var(--border-strong)] bg-[var(--surface)] p-2 shadow-md z-50"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5 mb-1.5 px-1">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeFilter({ aircraftTypes: new Set(aircraftTypes) })
                        }
                        className="font-mono text-[10.5px] font-semibold text-[#EE1C25] hover:underline"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeFilter({ aircraftTypes: new Set() })}
                        className="font-mono text-[10.5px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      >
                        Clear
                      </button>
                    </div>
                    {aircraftTypes.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-[var(--ink-muted)]">
                        No aircraft defined
                      </div>
                    ) : (
                      aircraftTypes.map((ac) => (
                        <label
                          key={ac}
                          className="flex items-center gap-2 rounded px-1.5 py-1.5 font-mono text-[11px] text-[var(--ink)] hover:bg-[var(--surface-alt)] cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={filters.aircraftTypes.has(ac)}
                            onChange={() => toggleAircraft(ac)}
                            className="accent-[#EE1C25] cursor-pointer"
                          />
                          <span>{ac}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onResetFilters}
                className="hidden lg:inline-flex h-9 items-center px-2 font-mono text-[11px] text-[var(--ink-muted)] hover:text-[#EE1C25] whitespace-nowrap"
                title="Clear all active map filters"
              >
                Reset ({activeFilterCount})
              </button>
            )}

            {/* Mobile/Tablet Filter Drawer Button (< lg) */}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open map filters"
              className="lg:hidden inline-flex h-9 items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 font-mono text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)] whitespace-nowrap shrink-0"
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="font-mono text-[10.5px] font-bold text-[#EE1C25]">
                  ({activeFilterCount})
                </span>
              )}
            </button>

            {/* Admin-Only Edit Mode Toggle */}
            {isAdminUnlocked && (
              <button
                type="button"
                onClick={onToggleSandbox}
                aria-pressed={sandboxMode}
                title="Local Edit Mode (Admin only)"
                className={`hidden sm:inline-flex h-9 items-center gap-1.5 rounded border px-3 font-mono text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  sandboxMode
                    ? 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-alt)]'
                }`}
              >
                <PenTool className="h-3.5 w-3.5" />
                <span>Edit Mode</span>
              </button>
            )}

            {/* Primary CTA: Network Editor */}
            <button
              type="button"
              onClick={onOpenEditor}
              className="inline-flex h-9 items-center gap-1.5 rounded bg-[#EE1C25] px-3 sm:px-3.5 font-mono text-[11px] font-semibold text-white hover:bg-[#cc121a] transition-colors whitespace-nowrap shrink-0"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Network Editor</span>
              <span className="sm:hidden">Editor</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile / Tablet Slide-Over Filter Drawer */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/50 backdrop-blur-[1px]"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Map filters"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-xs flex-col border-l border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--ink)]">Network Filters</h2>
                <p className="font-mono text-[10.5px] tabular-nums text-[var(--ink-muted)] mt-0.5">
                  {hubs.length} hubs · {activeAirportCount} active · {routeCount} sectors
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close filters"
                className="inline-flex h-9 w-9 items-center justify-center rounded border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-alt)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="mobile-filter-hub"
                  className="block font-mono text-[10.5px] font-semibold text-[var(--ink-muted)]"
                >
                  Hub Station
                </label>
                <select
                  id="mobile-filter-hub"
                  value={filters.hub}
                  onChange={(e) => onChangeFilter({ hub: e.target.value })}
                  className="h-10 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 font-mono text-xs text-[var(--ink)]"
                >
                  <option value="ALL">All Hubs ({hubs.length})</option>
                  {hubs.map((h) => (
                    <option key={h.icao} value={h.icao}>
                      {formatCityName(h.city)} ({h.icao})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="mobile-filter-continent"
                  className="block font-mono text-[10.5px] font-semibold text-[var(--ink-muted)]"
                >
                  Region
                </label>
                <select
                  id="mobile-filter-continent"
                  value={filters.continent}
                  onChange={(e) => onChangeFilter({ continent: e.target.value })}
                  className="h-10 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 font-mono text-xs text-[var(--ink)]"
                >
                  <option value="ALL">All Regions</option>
                  {CONTINENTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="mobile-filter-type"
                  className="block font-mono text-[10.5px] font-semibold text-[var(--ink-muted)]"
                >
                  Sector Type
                </label>
                <select
                  id="mobile-filter-type"
                  value={filters.type}
                  onChange={(e) => onChangeFilter({ type: e.target.value })}
                  className="h-10 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 font-mono text-xs text-[var(--ink)]"
                >
                  <option value="ALL">All Sector Types</option>
                  {routeTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-semibold text-[var(--ink-muted)]">
                    Aircraft Fleet
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeFilter({ aircraftTypes: new Set(aircraftTypes) })
                      }
                      className="font-mono text-[10.5px] text-[#EE1C25]"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeFilter({ aircraftTypes: new Set() })}
                      className="font-mono text-[10.5px] text-[var(--ink-muted)]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto rounded border border-[var(--border)] divide-y divide-[var(--border)]">
                  {aircraftTypes.length === 0 ? (
                    <div className="p-3 text-xs text-[var(--ink-muted)]">
                      No aircraft defined
                    </div>
                  ) : (
                    aircraftTypes.map((ac) => (
                      <label
                        key={ac}
                        className="flex items-center gap-2.5 px-3 py-2 font-mono text-xs text-[var(--ink)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={filters.aircraftTypes.has(ac)}
                          onChange={() => toggleAircraft(ac)}
                          className="accent-[#EE1C25]"
                        />
                        <span>{ac}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {isAdminUnlocked && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleSandbox();
                      setMobileDrawerOpen(false);
                    }}
                    className={`flex h-10 w-full items-center justify-center gap-2 rounded border font-mono text-xs font-semibold ${
                      sandboxMode
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-[var(--border-strong)] bg-[var(--surface-alt)] text-[var(--ink)]'
                    }`}
                  >
                    <PenTool className="h-4 w-4" />
                    <span>{sandboxMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3">
              <button
                type="button"
                onClick={onResetFilters}
                disabled={activeFilterCount === 0}
                className="font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-40"
              >
                Reset filters
              </button>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="rounded bg-[#EE1C25] px-4 py-2 font-mono text-xs font-semibold text-white hover:bg-[#cc121a]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
