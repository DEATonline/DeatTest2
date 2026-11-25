import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  LogOut,
  MapPin,
  Redo2,
  RotateCcw,
  Search,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  Airport,
  CONTINENTS,
  DEFAULT_ROUTE_COLOR,
  NetworkData,
  RouteSector,
  SANDBOX_COLOR_PRESETS,
} from '../types/network';
import {
  formatCityName,
  isValidHexColor,
  isValidIcao,
  parseAircraftList,
  sanitizeNetworkPayload,
} from '../utils/networkUtils';
import { PickedCoordinates } from './NetworkMap';

type AirportSortField = 'city' | 'code' | 'region' | 'role' | 'status';
type RouteSortField = 'color' | 'origin' | 'dest' | 'aircraft' | 'type';

interface NetworkEditorModalProps {
  open: boolean;
  firebaseReady: boolean;
  adminEmail: string | null;
  draft: NetworkData;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  remoteConflict: boolean;
  publishing: boolean;
  pickedCoords: PickedCoordinates | null;
  onClearPickedCoords: () => void;
  onStartPinPicker: () => void;
  onUpdateDraft: (updater: (prev: NetworkData) => NetworkData) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDiscardDraft: () => void;
  onReloadRemote: () => void;
  onDismissConflict: () => void;
  onPublish: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onClose: () => void;
  onNotify: (tone: 'info' | 'success' | 'warning' | 'error', text: string) => void;
}

export function NetworkEditorModal({
  open,
  firebaseReady,
  adminEmail,
  draft,
  isDirty,
  canUndo,
  canRedo,
  remoteConflict,
  publishing,
  pickedCoords,
  onClearPickedCoords,
  onStartPinPicker,
  onUpdateDraft,
  onUndo,
  onRedo,
  onDiscardDraft,
  onReloadRemote,
  onDismissConflict,
  onPublish,
  onSignOut,
  onClose,
  onNotify,
}: NetworkEditorModalProps) {
  const [activeTab, setActiveTab] = useState<'airports' | 'routes'>('airports');
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [formError, setFormError] = useState('');

  // Airport form state
  const [editingAirportIcao, setEditingAirportIcao] = useState<string | null>(null);
  const [apCity, setApCity] = useState('');
  const [apIcao, setApIcao] = useState('');
  const [apLat, setApLat] = useState('');
  const [apLon, setApLon] = useState('');
  const [apContinent, setApContinent] = useState<string>('Europe');
  const [apRole, setApRole] = useState<'dest' | 'hub'>('dest');
  const [apActive, setApActive] = useState<'true' | 'false'>('true');
  const [apRemarks, setApRemarks] = useState('');

  // Airport table state
  const [apSearch, setApSearch] = useState('');
  const [apSortField, setApSortField] = useState<AirportSortField | null>('city');
  const [apSortDir, setApSortDir] = useState<'asc' | 'desc'>('asc');

  // Route form state
  const [editingRouteIdx, setEditingRouteIdx] = useState<number | null>(null);
  const [rtOrigin, setRtOrigin] = useState('');
  const [rtDest, setRtDest] = useState('');
  const [rtAircraft, setRtAircraft] = useState('A320neo');
  const [rtType, setRtType] = useState('Scheduled');
  const [rtColor, setRtColor] = useState(DEFAULT_ROUTE_COLOR);
  const [rtRemarks, setRtRemarks] = useState('');

  // Route table state
  const [rtSearch, setRtSearch] = useState('');
  const [rtSortField, setRtSortField] = useState<RouteSortField | null>('origin');
  const [rtSortDir, setRtSortDir] = useState<'asc' | 'desc'>('asc');

  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Populate coordinates picked from the map
  useEffect(() => {
    if (!pickedCoords) return;
    setActiveTab('airports');
    setApLat(String(pickedCoords.lat));
    setApLon(String(pickedCoords.lon));
    setApContinent(pickedCoords.continent);
    onClearPickedCoords();
  }, [pickedCoords, onClearPickedCoords]);

  // Keep origin/dest selectors valid when airports list changes
  const dropdownAirports = useMemo(
    () => [...draft.airports].sort((a, b) => formatCityName(a.city).localeCompare(formatCityName(b.city))),
    [draft.airports],
  );

  useEffect(() => {
    if (!dropdownAirports.length) {
      setRtOrigin('');
      setRtDest('');
      return;
    }
    const codes = new Set(dropdownAirports.map((a) => a.icao));
    if (!rtOrigin || !codes.has(rtOrigin)) {
      setRtOrigin(dropdownAirports[0].icao);
    }
    if (!rtDest || !codes.has(rtDest)) {
      setRtDest(dropdownAirports[Math.min(1, dropdownAirports.length - 1)].icao);
    }
  }, [dropdownAirports, rtOrigin, rtDest]);

  const requestClose = () => {
    if (isDirty) {
      setConfirmCloseOpen(true);
    } else {
      setConfirmCloseOpen(false);
      onClose();
    }
  };

  // Keyboard shortcuts inside editor modal
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmCloseOpen) {
          setConfirmCloseOpen(false);
        } else {
          requestClose();
        }
        return;
      }

      if (!inInput && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) onRedo();
        } else {
          if (canUndo) onUndo();
        }
      } else if (!inInput && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) onRedo();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, confirmCloseOpen, isDirty, canUndo, canRedo, onUndo, onRedo]);

  const airportMap = useMemo(
    () => new Map(draft.airports.map((a) => [a.icao, a])),
    [draft.airports],
  );

  const filteredSortedAirports = useMemo(() => {
    const q = apSearch.trim().toLowerCase();
    const list = q
      ? draft.airports.filter(
          (a) =>
            a.icao.toLowerCase().includes(q) ||
            formatCityName(a.city).toLowerCase().includes(q) ||
            a.continent.toLowerCase().includes(q) ||
            a.remarks.toLowerCase().includes(q),
        )
      : [...draft.airports];

    if (apSortField) {
      const dir = apSortDir === 'desc' ? -1 : 1;
      list.sort((a, b) => {
        let av = '';
        let bv = '';
        if (apSortField === 'city') {
          av = formatCityName(a.city).toLowerCase();
          bv = formatCityName(b.city).toLowerCase();
        } else if (apSortField === 'code') {
          av = a.icao.toLowerCase();
          bv = b.icao.toLowerCase();
        } else if (apSortField === 'region') {
          av = a.continent.toLowerCase();
          bv = b.continent.toLowerCase();
        } else if (apSortField === 'role') {
          av = a.isHub ? 'hub' : 'station';
          bv = b.isHub ? 'hub' : 'station';
        } else if (apSortField === 'status') {
          av = a.active === false ? 'inactive' : 'active';
          bv = b.active === false ? 'inactive' : 'active';
        }
        return av.localeCompare(bv) * dir;
      });
    }
    return list;
  }, [draft.airports, apSearch, apSortField, apSortDir]);

  const filteredSortedRoutes = useMemo(() => {
    const q = rtSearch.trim().toLowerCase();
    const indexed = draft.routes.map((r, origIdx) => ({ r, origIdx }));
    const filtered = q
      ? indexed.filter(({ r }) => {
          const o = airportMap.get(r.origin);
          const d = airportMap.get(r.dest);
          const haystack = [
            r.origin,
            r.dest,
            o ? formatCityName(o.city) : '',
            d ? formatCityName(d.city) : '',
            r.aircraftTypes.join(' '),
            r.type,
            r.remarks,
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        })
      : indexed;

    if (rtSortField) {
      const dir = rtSortDir === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        let av = '';
        let bv = '';
        if (rtSortField === 'color') {
          av = (a.r.color || DEFAULT_ROUTE_COLOR).toLowerCase();
          bv = (b.r.color || DEFAULT_ROUTE_COLOR).toLowerCase();
        } else if (rtSortField === 'origin') {
          const ao = airportMap.get(a.r.origin);
          const bo = airportMap.get(b.r.origin);
          av = `${ao ? formatCityName(ao.city) : ''} ${a.r.origin}`.toLowerCase();
          bv = `${bo ? formatCityName(bo.city) : ''} ${b.r.origin}`.toLowerCase();
        } else if (rtSortField === 'dest') {
          const ad = airportMap.get(a.r.dest);
          const bd = airportMap.get(b.r.dest);
          av = `${ad ? formatCityName(ad.city) : ''} ${a.r.dest}`.toLowerCase();
          bv = `${bd ? formatCityName(bd.city) : ''} ${b.r.dest}`.toLowerCase();
        } else if (rtSortField === 'aircraft') {
          av = a.r.aircraftTypes.join(', ').toLowerCase();
          bv = b.r.aircraftTypes.join(', ').toLowerCase();
        } else if (rtSortField === 'type') {
          av = a.r.type.toLowerCase();
          bv = b.r.type.toLowerCase();
        }
        return av.localeCompare(bv) * dir;
      });
    }

    return filtered;
  }, [draft.routes, airportMap, rtSearch, rtSortField, rtSortDir]);

  if (!open) return null;

  const resetAirportForm = () => {
    setEditingAirportIcao(null);
    setApCity('');
    setApIcao('');
    setApLat('');
    setApLon('');
    setApContinent('Europe');
    setApRole('dest');
    setApActive('true');
    setApRemarks('');
    setFormError('');
  };

  const resetRouteForm = () => {
    setEditingRouteIdx(null);
    setRtAircraft('A320neo');
    setRtType('Scheduled');
    setRtColor(DEFAULT_ROUTE_COLOR);
    setRtRemarks('');
    setFormError('');
  };

  const handleSaveAirport = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const city = apCity.trim();
    const icao = apIcao.trim().toUpperCase();
    const lat = parseFloat(apLat);
    const lon = parseFloat(apLon);

    if (!city) {
      setFormError('Enter a city name.');
      return;
    }
    if (!isValidIcao(icao)) {
      setFormError('ICAO/IATA code must be 3 to 4 alphanumeric characters.');
      return;
    }
    if (Number.isNaN(lat) || lat < -85 || lat > 85 || Number.isNaN(lon) || lon < -180 || lon > 180) {
      setFormError('Enter valid coordinates (Lat -85..85, Lon -180..180).');
      return;
    }

    const entry: Airport = {
      icao,
      city: city.slice(0, 80),
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      continent: apContinent,
      isHub: apRole === 'hub',
      active: apActive === 'true',
      remarks: apRemarks.trim().slice(0, 300),
    };

    onUpdateDraft((prev) => {
      const nextAirports = [...prev.airports];
      let nextRoutes = [...prev.routes];

      if (editingAirportIcao && editingAirportIcao !== icao) {
        // Rename ICAO across existing routes if admin changed the code while editing
        const oldIdx = nextAirports.findIndex((a) => a.icao === editingAirportIcao);
        if (oldIdx >= 0) nextAirports.splice(oldIdx, 1);
        nextRoutes = nextRoutes.map((r) => ({
          ...r,
          origin: r.origin === editingAirportIcao ? icao : r.origin,
          dest: r.dest === editingAirportIcao ? icao : r.dest,
        }));
      }

      const existingIdx = nextAirports.findIndex((a) => a.icao === icao);
      if (existingIdx >= 0) {
        nextAirports[existingIdx] = entry;
      } else {
        nextAirports.push(entry);
      }

      return { airports: nextAirports, routes: nextRoutes };
    });

    resetAirportForm();
  };

  const handleToggleAirportActive = (icao: string) => {
    onUpdateDraft((prev) => ({
      ...prev,
      airports: prev.airports.map((a) =>
        a.icao === icao ? { ...a, active: a.active === false } : a,
      ),
    }));
  };

  const handleDeleteAirport = (icao: string) => {
    onUpdateDraft((prev) => ({
      airports: prev.airports.filter((a) => a.icao !== icao),
      routes: prev.routes.filter((r) => r.origin !== icao && r.dest !== icao),
    }));
    if (editingAirportIcao === icao) resetAirportForm();
  };

  const handleSelectAirportRow = (ap: Airport) => {
    setEditingAirportIcao(ap.icao);
    setApCity(formatCityName(ap.city));
    setApIcao(ap.icao);
    setApLat(String(ap.lat));
    setApLon(String(ap.lon));
    setApContinent(ap.continent);
    setApRole(ap.isHub ? 'hub' : 'dest');
    setApActive(ap.active === false ? 'false' : 'true');
    setApRemarks(ap.remarks || '');
    setFormError('');
  };

  const handleSaveRoute = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!rtOrigin || !rtDest) {
      setFormError('Add at least two airports before creating a flight sector.');
      return;
    }
    if (rtOrigin === rtDest) {
      setFormError('Origin and destination stations must be different.');
      return;
    }

    const aircraftTypes = parseAircraftList(rtAircraft);
    if (!aircraftTypes.length) {
      setFormError('Specify at least one aircraft type.');
      return;
    }

    const entry: RouteSector = {
      origin: rtOrigin,
      dest: rtDest,
      aircraftTypes,
      type: rtType.trim().slice(0, 40) || 'Scheduled',
      remarks: rtRemarks.trim().slice(0, 300),
      color: isValidHexColor(rtColor) ? rtColor : DEFAULT_ROUTE_COLOR,
    };

    onUpdateDraft((prev) => {
      const nextRoutes = [...prev.routes];
      if (editingRouteIdx !== null && editingRouteIdx >= 0 && editingRouteIdx < nextRoutes.length) {
        nextRoutes[editingRouteIdx] = entry;
      } else {
        const dupIdx = nextRoutes.findIndex(
          (r) => r.origin === entry.origin && r.dest === entry.dest && r.type === entry.type,
        );
        if (dupIdx >= 0) {
          nextRoutes[dupIdx] = entry;
        } else {
          nextRoutes.push(entry);
        }
      }
      return { ...prev, routes: nextRoutes };
    });

    resetRouteForm();
  };

  const handleSelectRouteRow = (r: RouteSector, origIdx: number) => {
    setEditingRouteIdx(origIdx);
    setRtOrigin(r.origin);
    setRtDest(r.dest);
    setRtAircraft(r.aircraftTypes.join(', '));
    setRtType(r.type || 'Scheduled');
    setRtColor(r.color || DEFAULT_ROUTE_COLOR);
    setRtRemarks(r.remarks || '');
    setFormError('');
  };

  const handleDeleteRoute = (origIdx: number) => {
    onUpdateDraft((prev) => ({
      ...prev,
      routes: prev.routes.filter((_, i) => i !== origIdx),
    }));
    if (editingRouteIdx === origIdx) resetRouteForm();
    else if (editingRouteIdx !== null && editingRouteIdx > origIdx) {
      setEditingRouteIdx(editingRouteIdx - 1);
    }
  };

  const toggleAirportSort = (field: AirportSortField) => {
    if (apSortField === field) {
      setApSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setApSortField(field);
      setApSortDir('asc');
    }
  };

  const toggleRouteSort = (field: RouteSortField) => {
    if (rtSortField === field) {
      setRtSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRtSortField(field);
      setRtSortDir('asc');
    }
  };

  const handleImportJson = async (file: File) => {
    setFormError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let candidate: unknown = parsed;
      if (parsed && typeof parsed === 'object' && 'payload' in parsed && parsed.payload) {
        candidate = (parsed as { payload: unknown }).payload;
      } else if (Array.isArray(parsed)) {
        candidate = { airports: parsed, routes: draft.routes };
      }

      if (
        !candidate ||
        typeof candidate !== 'object' ||
        (!Array.isArray((candidate as Record<string, unknown>).airports) &&
          !Array.isArray((candidate as Record<string, unknown>).routes))
      ) {
        throw new Error("JSON must contain 'airports' and/or 'routes' arrays.");
      }

      const sanitized = sanitizeNetworkPayload(candidate);
      const hasRoutes = Array.isArray((candidate as Record<string, unknown>).routes);
      onUpdateDraft((prev) => ({
        airports: sanitized.airports,
        routes: hasRoutes ? sanitized.routes : prev.routes,
      }));
      resetAirportForm();
      resetRouteForm();
      onNotify(
        'success',
        `Imported ${sanitized.airports.length} airports and ${
          hasRoutes ? sanitized.routes.length : draft.routes.length
        } sectors into draft.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import JSON backup file.';
      setFormError(msg);
      onNotify('error', msg);
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deat-route-network-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    onNotify('info', 'Exported network JSON backup.');
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-2 sm:p-4"
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[94vh] w-full max-w-[1640px] flex-col overflow-hidden rounded border border-[var(--border-strong)] bg-[var(--surface)] shadow-xl"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-alt)] px-4 sm:px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2
              id="editor-modal-title"
              className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--ink)] whitespace-nowrap"
            >
              Network Editor
            </h2>
            {isDirty ? (
              <span className="font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                · Unsaved draft changes
              </span>
            ) : (
              <span className="font-mono text-[11px] text-[var(--ink-muted)] whitespace-nowrap">
                · Up to date
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Undo / Redo */}
            <div className="flex items-center rounded border border-[var(--border)] bg-[var(--surface)]">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="inline-flex h-8 w-8 items-center justify-center border-r border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-alt)] disabled:opacity-35"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                className="inline-flex h-8 w-8 items-center justify-center text-[var(--ink)] hover:bg-[var(--surface-alt)] disabled:opacity-35"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {adminEmail && (
              <span className="hidden md:inline font-mono text-[11px] text-[var(--ink-muted)] truncate max-w-[200px]">
                {adminEmail}
              </span>
            )}

            {firebaseReady && adminEmail && (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)] whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}

            <button
              type="button"
              onClick={requestClose}
              aria-label="Close Network Editor"
              className="inline-flex h-8 items-center gap-1 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)]"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* Remote Conflict Protection Banner */}
        {remoteConflict && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/60 bg-[var(--sandbox-bg)] px-4 sm:px-5 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Remote Firestore network was updated while you have unpublished local edits.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onReloadRemote}
                className="rounded border border-amber-600/60 bg-[var(--surface)] px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
              >
                Reload Latest
              </button>
              <button
                type="button"
                onClick={onDismissConflict}
                className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[11px] text-[var(--ink)] hover:bg-[var(--surface-alt)]"
              >
                Keep Local Draft
              </button>
            </div>
          </div>
        )}

        {/* Unsaved Close Confirmation Bar */}
        {confirmCloseOpen && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-500/40 bg-red-500/5 px-4 sm:px-5 py-2.5 text-xs">
            <span className="font-medium text-[var(--ink)]">
              You have unpublished changes in your draft. Discard them or stay to publish?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(false)}
                className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 font-mono text-[11px] font-medium text-[var(--ink)]"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  onDiscardDraft();
                  setConfirmCloseOpen(false);
                  onClose();
                }}
                className="rounded bg-[var(--err)] px-3 py-1 font-mono text-[11px] font-semibold text-white"
              >
                Discard &amp; Close
              </button>
            </div>
          </div>
        )}

        {/* Mobile/Tablet Section Tabs (< xl) */}
        <div className="flex xl:hidden border-b border-[var(--border)] bg-[var(--surface-alt)] px-4 pt-2 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('airports')}
            className={`px-3.5 py-2 font-mono text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'airports'
                ? 'border-[#EE1C25] text-[var(--ink)]'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            Airports &amp; Hubs ({draft.airports.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('routes')}
            className={`px-3.5 py-2 font-mono text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'routes'
                ? 'border-[#EE1C25] text-[var(--ink)]'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            Flight Sectors ({draft.routes.length})
          </button>
        </div>

        {/* Main Workspace Split Grid */}
        <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4 flex flex-col gap-3">
          <div className="grid flex-1 min-h-0 grid-cols-1 xl:grid-cols-2 gap-4">
            {/* AIRPORTS & HUBS SECTION */}
            <section
              className={`${
                activeTab === 'airports' ? 'flex' : 'hidden xl:flex'
              } flex-col min-h-0 rounded border border-[var(--border)] bg-[var(--surface)] p-3.5 gap-3 overflow-hidden`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)]">
                  Airports &amp; Hubs{' '}
                  <span className="tabular-nums text-[var(--ink-muted)]">
                    ({draft.airports.length})
                  </span>
                </h3>
                {editingAirportIcao && (
                  <button
                    type="button"
                    onClick={resetAirportForm}
                    className="font-mono text-[11px] font-medium text-[#EE1C25] hover:underline"
                  >
                    Cancel edit ({editingAirportIcao})
                  </button>
                )}
              </div>

              <form
                onSubmit={handleSaveAirport}
                className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0"
              >
                <div className="col-span-2 sm:col-span-2 space-y-1">
                  <label
                    htmlFor="ed-ap-city"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    City Name
                  </label>
                  <input
                    id="ed-ap-city"
                    type="text"
                    required
                    value={apCity}
                    onChange={(e) => setApCity(e.target.value)}
                    placeholder="e.g. Frankfurt am Main"
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="ed-ap-icao"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    ICAO / IATA
                  </label>
                  <input
                    id="ed-ap-icao"
                    type="text"
                    required
                    maxLength={4}
                    value={apIcao}
                    onChange={(e) => setApIcao(e.target.value.toUpperCase())}
                    placeholder="LOWW"
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-xs uppercase text-[var(--ink)] focus:border-[#EE1C25]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="ed-ap-region"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Region
                  </label>
                  <select
                    id="ed-ap-region"
                    value={apContinent}
                    onChange={(e) => setApContinent(e.target.value)}
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  >
                    {CONTINENTS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="ed-ap-lat"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Latitude
                  </label>
                  <input
                    id="ed-ap-lat"
                    type="number"
                    step="0.0001"
                    min={-85}
                    max={85}
                    required
                    value={apLat}
                    onChange={(e) => setApLat(e.target.value)}
                    placeholder="48.1103"
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-xs tabular-nums text-[var(--ink)] focus:border-[#EE1C25]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="ed-ap-lon"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Longitude
                  </label>
                  <input
                    id="ed-ap-lon"
                    type="number"
                    step="0.0001"
                    min={-180}
                    max={180}
                    required
                    value={apLon}
                    onChange={(e) => setApLon(e.target.value)}
                    placeholder="16.5697"
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-xs tabular-nums text-[var(--ink)] focus:border-[#EE1C25]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="ed-ap-role"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Role
                  </label>
                  <select
                    id="ed-ap-role"
                    value={apRole}
                    onChange={(e) => setApRole(e.target.value as 'dest' | 'hub')}
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  >
                    <option value="dest">Station</option>
                    <option value="hub">Hub</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="ed-ap-status"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Status
                  </label>
                  <select
                    id="ed-ap-status"
                    value={apActive}
                    onChange={(e) => setApActive(e.target.value as 'true' | 'false')}
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>

                <div className="col-span-2 space-y-1">
                  <label
                    htmlFor="ed-ap-remarks"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Internal Remarks (Admin Only)
                  </label>
                  <input
                    id="ed-ap-remarks"
                    type="text"
                    value={apRemarks}
                    onChange={(e) => setApRemarks(e.target.value)}
                    placeholder="Slot constraints, terminal notes..."
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  />
                </div>

                <div className="col-span-2 flex items-end gap-2">
                  <button
                    type="button"
                    onClick={onStartPinPicker}
                    title="Click on the map to automatically fill latitude, longitude, and region"
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--surface-alt)] px-3 font-mono text-[11px] font-semibold text-[var(--ink)] hover:bg-[var(--border)]/40 whitespace-nowrap"
                  >
                    <MapPin className="h-3.5 w-3.5 text-[#EE1C25]" />
                    <span>Pick on Map</span>
                  </button>
                  <button
                    type="submit"
                    className="h-9 flex-1 rounded bg-[#EE1C25] px-3 font-mono text-[11px] font-semibold text-white hover:bg-[#cc121a] whitespace-nowrap"
                  >
                    {editingAirportIcao ? 'Update Airport' : 'Add Airport'}
                  </button>
                </div>
              </form>

              {/* Airport Table Search */}
              <div className="relative shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ink-muted)]" />
                <input
                  type="text"
                  value={apSearch}
                  onChange={(e) => setApSearch(e.target.value)}
                  placeholder="Filter airports by city, code, region, or remarks..."
                  className="h-8 w-full rounded border border-[var(--border)] bg-[var(--surface-alt)] pl-8 pr-3 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[#EE1C25] focus:bg-[var(--surface)]"
                />
              </div>

              {/* Airport Table */}
              <div className="flex-1 min-h-[160px] overflow-auto rounded border border-[var(--border)]">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--surface-alt)]">
                    <tr className="border-b border-[var(--border)]">
                      {(
                        [
                          ['city', 'City'],
                          ['code', 'Code'],
                          ['region', 'Region'],
                          ['role', 'Role'],
                          ['status', 'Status'],
                        ] as Array<[AirportSortField, string]>
                      ).map(([field, label]) => (
                        <th key={field} className="px-2.5 py-2 text-left">
                          <button
                            type="button"
                            onClick={() => toggleAirportSort(field)}
                            className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wide ${
                              apSortField === field
                                ? 'text-[var(--ink)]'
                                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                            }`}
                          >
                            <span>{label}</span>
                            {apSortField === field && (
                              <span className="text-[#EE1C25]">
                                {apSortDir === 'desc' ? '▼' : '▲'}
                              </span>
                            )}
                          </button>
                        </th>
                      ))}
                      <th className="px-2.5 py-2 text-left font-mono text-[10px] font-bold uppercase text-[var(--ink-muted)]">
                        Remarks
                      </th>
                      <th className="px-2.5 py-2 text-right font-mono text-[10px] font-bold uppercase text-[var(--ink-muted)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredSortedAirports.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-6 text-center text-xs text-[var(--ink-muted)]"
                        >
                          {draft.airports.length === 0
                            ? 'No airports in network yet. Add one above or import JSON.'
                            : 'No airports match your filter.'}
                        </td>
                      </tr>
                    ) : (
                      filteredSortedAirports.map((a) => {
                        const isEditing = editingAirportIcao === a.icao;
                        return (
                          <tr
                            key={a.icao}
                            onClick={() => handleSelectAirportRow(a)}
                            className={`cursor-pointer transition-colors ${
                              isEditing
                                ? 'bg-red-500/8 dark:bg-red-500/15'
                                : 'hover:bg-[var(--surface-alt)]'
                            }`}
                          >
                            <td className="px-2.5 py-2 font-semibold text-[var(--ink)] whitespace-nowrap">
                              {formatCityName(a.city)}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-[11px] tabular-nums text-[var(--ink-secondary)]">
                              {a.icao}
                            </td>
                            <td className="px-2.5 py-2 text-[var(--ink-secondary)] whitespace-nowrap">
                              {a.continent}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-[11px]">
                              {a.isHub ? (
                                <span className="font-bold text-[#EE1C25]">Hub</span>
                              ) : (
                                <span className="text-[var(--ink-muted)]">Station</span>
                              )}
                            </td>
                            <td className="px-2.5 py-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleAirportActive(a.icao);
                                }}
                                className={`rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10.5px] font-semibold hover:bg-[var(--surface)] ${
                                  a.active === false
                                    ? 'text-[var(--ink-muted)]'
                                    : 'text-[var(--ok)]'
                                }`}
                              >
                                {a.active === false ? 'Inactive' : 'Active'}
                              </button>
                            </td>
                            <td
                              className="px-2.5 py-2 max-w-[140px] truncate text-[var(--ink-muted)]"
                              title={a.remarks}
                            >
                              {a.remarks || '—'}
                            </td>
                            <td className="px-2.5 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAirport(a.icao);
                                }}
                                className="rounded border border-red-500/35 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[var(--err)] hover:bg-red-500/10"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* FLIGHT SECTORS SECTION */}
            <section
              className={`${
                activeTab === 'routes' ? 'flex' : 'hidden xl:flex'
              } flex-col min-h-0 rounded border border-[var(--border)] bg-[var(--surface)] p-3.5 gap-3 overflow-hidden`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)]">
                  Flight Sectors{' '}
                  <span className="tabular-nums text-[var(--ink-muted)]">
                    ({draft.routes.length})
                  </span>
                </h3>
                {editingRouteIdx !== null && (
                  <button
                    type="button"
                    onClick={resetRouteForm}
                    className="font-mono text-[11px] font-medium text-[#EE1C25] hover:underline"
                  >
                    Cancel edit
                  </button>
                )}
              </div>

              <form
                onSubmit={handleSaveRoute}
                className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0"
              >
                <div className="col-span-1 sm:col-span-2 space-y-1">
                  <label
                    htmlFor="ed-rt-origin"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Origin
                  </label>
                  <select
                    id="ed-rt-origin"
                    required
                    value={rtOrigin}
                    onChange={(e) => setRtOrigin(e.target.value)}
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  >
                    {dropdownAirports.length === 0 ? (
                      <option value="">Add airports first</option>
                    ) : (
                      dropdownAirports.map((a) => (
                        <option key={a.icao} value={a.icao}>
                          {formatCityName(a.city)} ({a.icao})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="col-span-1 sm:col-span-2 space-y-1">
                  <label
                    htmlFor="ed-rt-dest"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Destination
                  </label>
                  <select
                    id="ed-rt-dest"
                    required
                    value={rtDest}
                    onChange={(e) => setRtDest(e.target.value)}
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  >
                    {dropdownAirports.length === 0 ? (
                      <option value="">Add airports first</option>
                    ) : (
                      dropdownAirports.map((a) => (
                        <option key={a.icao} value={a.icao}>
                          {formatCityName(a.city)} ({a.icao})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="col-span-2 space-y-1">
                  <label
                    htmlFor="ed-rt-aircraft"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Aircraft (comma-separated)
                  </label>
                  <input
                    id="ed-rt-aircraft"
                    type="text"
                    required
                    value={rtAircraft}
                    onChange={(e) => setRtAircraft(e.target.value)}
                    placeholder="e.g. A320neo, B787-9"
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 font-mono text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="ed-rt-type"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Type
                  </label>
                  <input
                    id="ed-rt-type"
                    type="text"
                    required
                    value={rtType}
                    onChange={(e) => setRtType(e.target.value)}
                    placeholder="Scheduled"
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="ed-rt-color"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Color
                  </label>
                  <div className="flex h-9 items-center gap-1.5">
                    <input
                      id="ed-rt-color"
                      type="color"
                      value={rtColor}
                      onChange={(e) => setRtColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer rounded border border-[var(--border-strong)] bg-transparent p-0.5 shrink-0"
                    />
                    <div className="flex items-center gap-1">
                      {SANDBOX_COLOR_PRESETS.slice(0, 4).map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setRtColor(p.hex)}
                          title={p.label}
                          aria-label={`Set sector color ${p.label}`}
                          className="h-4 w-4 rounded-sm border border-black/20"
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-3 space-y-1">
                  <label
                    htmlFor="ed-rt-remarks"
                    className="block font-mono text-[10px] font-semibold uppercase text-[var(--ink-muted)]"
                  >
                    Internal Remarks (Admin Only)
                  </label>
                  <input
                    id="ed-rt-remarks"
                    type="text"
                    value={rtRemarks}
                    onChange={(e) => setRtRemarks(e.target.value)}
                    placeholder="Traffic rights, seasonality, frequency notes..."
                    className="h-9 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--ink)] focus:border-[#EE1C25]"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1 flex items-end">
                  <button
                    type="submit"
                    className="h-9 w-full rounded bg-[#EE1C25] px-3 font-mono text-[11px] font-semibold text-white hover:bg-[#cc121a] whitespace-nowrap"
                  >
                    {editingRouteIdx !== null ? 'Update Sector' : 'Add Sector'}
                  </button>
                </div>
              </form>

              {/* Route Table Search */}
              <div className="relative shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ink-muted)]" />
                <input
                  type="text"
                  value={rtSearch}
                  onChange={(e) => setRtSearch(e.target.value)}
                  placeholder="Filter sectors by origin, destination, aircraft, type, or remarks..."
                  className="h-8 w-full rounded border border-[var(--border)] bg-[var(--surface-alt)] pl-8 pr-3 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[#EE1C25] focus:bg-[var(--surface)]"
                />
              </div>

              {/* Route Table */}
              <div className="flex-1 min-h-[160px] overflow-auto rounded border border-[var(--border)]">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--surface-alt)]">
                    <tr className="border-b border-[var(--border)]">
                      {(
                        [
                          ['color', ''],
                          ['origin', 'Origin'],
                          ['dest', 'Destination'],
                          ['aircraft', 'Aircraft'],
                          ['type', 'Type'],
                        ] as Array<[RouteSortField, string]>
                      ).map(([field, label]) => (
                        <th key={field} className="px-2.5 py-2 text-left">
                          <button
                            type="button"
                            onClick={() => toggleRouteSort(field)}
                            className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wide ${
                              rtSortField === field
                                ? 'text-[var(--ink)]'
                                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                            }`}
                          >
                            <span>{label || 'Col'}</span>
                            {rtSortField === field && (
                              <span className="text-[#EE1C25]">
                                {rtSortDir === 'desc' ? '▼' : '▲'}
                              </span>
                            )}
                          </button>
                        </th>
                      ))}
                      <th className="px-2.5 py-2 text-left font-mono text-[10px] font-bold uppercase text-[var(--ink-muted)]">
                        Remarks
                      </th>
                      <th className="px-2.5 py-2 text-right font-mono text-[10px] font-bold uppercase text-[var(--ink-muted)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredSortedRoutes.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-6 text-center text-xs text-[var(--ink-muted)]"
                        >
                          {draft.routes.length === 0
                            ? 'No flight sectors defined yet.'
                            : 'No flight sectors match your filter.'}
                        </td>
                      </tr>
                    ) : (
                      filteredSortedRoutes.map(({ r, origIdx }) => {
                        const o = airportMap.get(r.origin);
                        const d = airportMap.get(r.dest);
                        const isEditing = editingRouteIdx === origIdx;
                        return (
                          <tr
                            key={`${r.origin}-${r.dest}-${origIdx}`}
                            onClick={() => handleSelectRouteRow(r, origIdx)}
                            className={`cursor-pointer transition-colors ${
                              isEditing
                                ? 'bg-red-500/8 dark:bg-red-500/15'
                                : 'hover:bg-[var(--surface-alt)]'
                            }`}
                          >
                            <td className="px-2.5 py-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: r.color || DEFAULT_ROUTE_COLOR }}
                                title={r.color || DEFAULT_ROUTE_COLOR}
                              />
                            </td>
                            <td className="px-2.5 py-2 whitespace-nowrap">
                              <span className="font-semibold text-[var(--ink)]">
                                {o ? formatCityName(o.city) : r.origin}
                              </span>{' '}
                              <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
                                ({r.origin})
                              </span>
                            </td>
                            <td className="px-2.5 py-2 whitespace-nowrap">
                              <span className="font-semibold text-[var(--ink)]">
                                {d ? formatCityName(d.city) : r.dest}
                              </span>{' '}
                              <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
                                ({r.dest})
                              </span>
                            </td>
                            <td className="px-2.5 py-2 font-mono text-[11px] text-[var(--ink-secondary)]">
                              {r.aircraftTypes.join(' · ')}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-[11px] text-[var(--ink-secondary)] whitespace-nowrap">
                              {r.type}
                            </td>
                            <td
                              className="px-2.5 py-2 max-w-[130px] truncate text-[var(--ink-muted)]"
                              title={r.remarks}
                            >
                              {r.remarks || '—'}
                            </td>
                            <td className="px-2.5 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRoute(origIdx);
                                }}
                                className="rounded border border-red-500/35 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[var(--err)] hover:bg-red-500/10"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {formError && (
            <div role="alert" className="font-mono text-xs text-[var(--err)] px-1">
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-alt)] px-4 sm:px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportJson(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 font-mono text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)]"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import JSON</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 font-mono text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export JSON</span>
            </button>
            {isDirty && (
              <button
                type="button"
                onClick={onDiscardDraft}
                className="inline-flex h-9 items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 font-mono text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Discard Draft</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!firebaseReady && (
              <span className="hidden md:inline font-mono text-[11px] text-[var(--ink-muted)]">
                Local preview · replace firebase-config.js for live sync
              </span>
            )}
            <button
              type="button"
              disabled={publishing || !isDirty}
              onClick={onPublish}
              className="h-9 rounded bg-[#EE1C25] px-4 font-mono text-xs font-semibold text-white hover:bg-[#cc121a] disabled:opacity-45 transition-colors whitespace-nowrap"
            >
              {publishing
                ? 'Publishing...'
                : firebaseReady
                  ? 'Publish to Firebase'
                  : 'Apply Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
