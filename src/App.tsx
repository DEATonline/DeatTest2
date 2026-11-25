import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { Eye, Hash, Minus, Moon, Plus, RotateCcw, Sun } from 'lucide-react';
import {
  AdminOverlayState,
  Airport,
  DEFAULT_ROUTE_COLOR,
  FilterState,
  NetworkData,
  RouteSector,
  SandboxTool,
  SyncState,
  ToastMessage,
} from './types/network';
import {
  areNetworksEqual,
  cloneNetworkData,
  computeNetworkDiff,
  computeRouteCountMap,
  formatCityName,
  getRouteContentSignature,
  isValidHexColor,
  mergeImportedIntoWorkspace,
  mergeNewItemsIntoLive,
  SAMPLE_NETWORK_DATA,
  sanitizeNetworkPayload,
} from './utils/networkUtils';
import {
  fetchInitialNetworkState,
  initFirebaseClient,
  publishNetworkState,
  signInAdmin,
  signOutAdmin,
  subscribeAuth,
  subscribeNetworkState,
} from './services/firebaseService';
import {
  IndexedRouteItem,
  NetworkMap,
  NetworkMapHandle,
  PickedCoordinates,
} from './components/NetworkMap';
import { TopBar } from './components/TopBar';
import { InspectorPanel } from './components/InspectorPanel';
import { SandboxBar } from './components/SandboxBar';
import { SandboxItemPanel, SandboxSelection } from './components/SandboxItemPanel';
import { PublishSandboxModal, PublishStrategy } from './components/PublishSandboxModal';
import {
  ImportEditModeModal,
  ImportStrategy,
  PendingImportPayload,
} from './components/ImportEditModeModal';
import { AuthModal } from './components/AuthModal';
import { NetworkEditorModal } from './components/NetworkEditorModal';
import { ToastContainer } from './components/ToastContainer';

const PREVIEW_STORAGE_KEY = 'deat_preview_network_v1';
const DARK_MODE_STORAGE_KEY = 'deat_dark_mode';

function loadPreviewNetwork(): NetworkData {
  try {
    const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (raw) {
      const parsed = sanitizeNetworkPayload(JSON.parse(raw));
      if (parsed.airports.length > 0) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return cloneNetworkData(SAMPLE_NETWORK_DATA);
}

export default function App() {
  const mapRef = useRef<NetworkMapHandle | null>(null);

  // Firebase & Auth state
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('saving');
  const [syncText, setSyncText] = useState('Connecting');

  // Core live network state (never mutated by Sandbox until explicitly published)
  const [networkData, setNetworkData] = useState<NetworkData>({ airports: [], routes: [] });

  // Network Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [draft, setDraft] = useState<NetworkData>({ airports: [], routes: [] });
  const [undoStack, setUndoStack] = useState<NetworkData[]>([]);
  const [redoStack, setRedoStack] = useState<NetworkData[]>([]);
  const [remoteConflict, setRemoteConflict] = useState(false);
  const [latestRemoteData, setLatestRemoteData] = useState<NetworkData | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Network Editor pin picker state
  const [pinPickerActive, setPinPickerActive] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<PickedCoordinates | null>(null);

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    hub: 'ALL',
    continent: 'ALL',
    type: 'ALL',
    aircraftTypes: new Set<string>(),
  });

  // Admin-only map overlays
  const [adminOverlays, setAdminOverlays] = useState<AdminOverlayState>({
    showLiveRoutes: true,
    showSandboxRoutes: true,
    showAirportCounts: false,
    showAllAirports: false,
  });

  // Public inspector selection state
  const [selectedAirportIcao, setSelectedAirportIcao] = useState<string | null>(null);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const [selectedRouteObj, setSelectedRouteObj] = useState<RouteSector | null>(null);

  // Redesigned Sandbox Workspace state (strictly local & admin-only)
  const [sandboxMode, setSandboxMode] = useState(false);
  const [sandboxInitialized, setSandboxInitialized] = useState(false);
  const [sandboxNetwork, setSandboxNetwork] = useState<NetworkData>({ airports: [], routes: [] });
  const [sandboxUndoStack, setSandboxUndoStack] = useState<NetworkData[]>([]);
  const [sandboxRedoStack, setSandboxRedoStack] = useState<NetworkData[]>([]);
  const [sandboxTool, setSandboxTool] = useState<SandboxTool>('draw');
  const [sandboxPendingOrigin, setSandboxPendingOrigin] = useState<string | null>(null);
  const [sandboxColor, setSandboxColor] = useState(DEFAULT_ROUTE_COLOR);
  const [sandboxSelection, setSandboxSelection] = useState<SandboxSelection | null>(null);
  const [publishSandboxOpen, setPublishSandboxOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImportPayload | null>(null);

  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DARK_MODE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((tone: ToastMessage['tone'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem(DARK_MODE_STORAGE_KEY, darkMode ? '1' : '0');
    } catch {
      // ignore
    }
  }, [darkMode]);

  const isDirty = useMemo(
    () => !areNetworksEqual(draft, networkData),
    [draft, networkData],
  );

  const editorStateRef = useRef({ editorOpen: false, isDirty: false });
  useEffect(() => {
    editorStateRef.current = { editorOpen: editorOpen || pinPickerActive, isDirty };
  }, [editorOpen, pinPickerActive, isDirty]);

  // Boot Firebase (preserving existing window.FIREBASE_CONFIG & networkState/default)
  useEffect(() => {
    const ready = initFirebaseClient();
    setFirebaseReady(ready);

    if (!ready) {
      const sample = loadPreviewNetwork();
      setNetworkData(sample);
      setDraft(cloneNetworkData(sample));
      setSyncState('preview');
      setSyncText('Local Preview');
      return;
    }

    setSyncState('saving');
    setSyncText('Connecting');

    const unsubAuth = subscribeAuth((user) => {
      setCurrentUser(user);
      if (!user) {
        setSandboxMode(false);
        setSandboxPendingOrigin(null);
        setSandboxSelection(null);
        setPublishSandboxOpen(false);
        setAdminOverlays({
          showLiveRoutes: true,
          showSandboxRoutes: true,
          showAirportCounts: false,
          showAllAirports: false,
        });
      }
    });

    let active = true;
    fetchInitialNetworkState()
      .then((initial) => {
        if (!active) return;
        if (initial) {
          setNetworkData(initial);
          setDraft(cloneNetworkData(initial));
        }
        setSyncState('synced');
        setSyncText('Live');
      })
      .catch((err) => {
        if (!active) return;
        console.error('Initial Firestore load error:', err);
        setSyncState('error');
        setSyncText('Read Error');
      });

    const unsubData = subscribeNetworkState(
      (incoming) => {
        if (!active) return;
        setNetworkData(incoming);
        if (editorStateRef.current.editorOpen && editorStateRef.current.isDirty) {
          setLatestRemoteData(incoming);
          setRemoteConflict(true);
        } else {
          setDraft(cloneNetworkData(incoming));
          setUndoStack([]);
          setRedoStack([]);
          setRemoteConflict(false);
        }
        setSyncState('synced');
        setSyncText('Live');
      },
      (code) => {
        if (!active) return;
        setSyncState('error');
        setSyncText(`Err ${code}`);
      },
    );

    return () => {
      active = false;
      unsubAuth();
      unsubData();
    };
  }, []);

  // Strict admin-only gate (requires Firebase admin login when Firebase is configured)
  const isAdminUnlocked = firebaseReady ? Boolean(currentUser) : true;

  // Active working dataset for map & search (sandboxNetwork when in Sandbox Mode, else live networkData)
  const activeDataset = sandboxMode ? sandboxNetwork : networkData;

  // Live vs. Edit Mode Diff & Add-Only Preview
  const sandboxDiff = useMemo(
    () =>
      sandboxInitialized
        ? computeNetworkDiff(networkData, sandboxNetwork)
        : computeNetworkDiff(networkData, networkData),
    [sandboxInitialized, networkData, sandboxNetwork],
  );

  const addOnlyPreview = useMemo(
    () =>
      sandboxInitialized
        ? mergeNewItemsIntoLive(networkData, sandboxNetwork)
        : { merged: networkData, addedAirports: [], addedRoutes: [] },
    [sandboxInitialized, networkData, sandboxNetwork],
  );

  // Sandbox mutation helper with undo/redo stack
  const updateSandboxNetwork = useCallback(
    (updater: (prev: NetworkData) => NetworkData) => {
      setSandboxNetwork((prev) => {
        const next = updater(prev);
        setSandboxUndoStack((stack) => [...stack.slice(-29), cloneNetworkData(prev)]);
        setSandboxRedoStack([]);
        return next;
      });
    },
    [],
  );

  const handleSandboxUndo = useCallback(() => {
    setSandboxUndoStack((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setSandboxNetwork((curr) => {
        setSandboxRedoStack((r) => [...r, cloneNetworkData(curr)]);
        return previous;
      });
      setSandboxSelection(null);
      return stack.slice(0, -1);
    });
  }, []);

  const handleSandboxRedo = useCallback(() => {
    setSandboxRedoStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setSandboxNetwork((curr) => {
        setSandboxUndoStack((u) => [...u, cloneNetworkData(curr)]);
        return next;
      });
      setSandboxSelection(null);
      return stack.slice(0, -1);
    });
  }, []);

  // Global keyboard shortcuts (Escape + Sandbox Undo/Redo)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if (e.key === 'Escape') {
        if (editorOpen || authOpen || publishSandboxOpen || pendingImport) return;
        if (pinPickerActive) {
          setPinPickerActive(false);
          setEditorOpen(true);
          return;
        }
        if (sandboxPendingOrigin) {
          setSandboxPendingOrigin(null);
          return;
        }
        if (sandboxSelection) {
          setSandboxSelection(null);
          return;
        }
        if (selectedAirportIcao || selectedRouteKey) {
          setSelectedAirportIcao(null);
          setSelectedRouteKey(null);
          setSelectedRouteObj(null);
        }
        return;
      }

      if (
        sandboxMode &&
        !editorOpen &&
        !authOpen &&
        !publishSandboxOpen &&
        !pendingImport &&
        !inInput
      ) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) handleSandboxRedo();
          else handleSandboxUndo();
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleSandboxRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    editorOpen,
    authOpen,
    publishSandboxOpen,
    pendingImport,
    pinPickerActive,
    sandboxMode,
    sandboxPendingOrigin,
    sandboxSelection,
    selectedAirportIcao,
    selectedRouteKey,
    handleSandboxUndo,
    handleSandboxRedo,
  ]);

  // Derived lists from activeDataset
  const activeAirportsAll = useMemo(
    () => activeDataset.airports.filter((a) => a.active !== false),
    [activeDataset.airports],
  );

  const hubs = useMemo(
    () => activeAirportsAll.filter((a) => a.isHub),
    [activeAirportsAll],
  );

  const allRouteTypes = useMemo(
    () =>
      [...new Set(activeDataset.routes.map((r) => r.type.trim()).filter(Boolean))].sort(),
    [activeDataset.routes],
  );

  const allAircraftTypes = useMemo(
    () =>
      [...new Set(activeDataset.routes.flatMap((r) => r.aircraftTypes).filter(Boolean))].sort(),
    [activeDataset.routes],
  );

  useEffect(() => {
    const available = new Set(allAircraftTypes);
    let changed = false;
    const next = new Set<string>();
    filters.aircraftTypes.forEach((ac) => {
      if (available.has(ac)) next.add(ac);
      else changed = true;
    });
    if (changed) {
      setFilters((prev) => ({ ...prev, aircraftTypes: next }));
    }
  }, [allAircraftTypes, filters.aircraftTypes]);

  // Filter helper applied cleanly to activeDataset (and matching filters on Live Overlay)
  const { filteredRoutes, visibleAirports, airportByIcao } = useMemo(() => {
    const includeAll = Boolean(isAdminUnlocked && (adminOverlays.showAllAirports || sandboxMode));
    const baseAirports = includeAll ? activeDataset.airports : activeAirportsAll;
    const map = new Map(baseAirports.map((a) => [a.icao, a]));
    const hasAcFilter = filters.aircraftTypes.size > 0;

    const matchedRoutes: IndexedRouteItem[] = [];
    activeDataset.routes.forEach((r, sourceIndex) => {
      const o = map.get(r.origin);
      const d = map.get(r.dest);
      if (!o || !d) return;
      if (filters.hub !== 'ALL' && r.origin !== filters.hub && r.dest !== filters.hub) return;
      if (
        filters.continent !== 'ALL' &&
        o.continent !== filters.continent &&
        d.continent !== filters.continent
      ) {
        return;
      }
      if (filters.type !== 'ALL' && r.type !== filters.type) return;
      if (hasAcFilter && !r.aircraftTypes.some((ac) => filters.aircraftTypes.has(ac))) return;
      matchedRoutes.push({ route: r, sourceIndex });
    });

    const visIcaos = new Set<string>();
    const noFiltersActive =
      filters.hub === 'ALL' &&
      filters.continent === 'ALL' &&
      filters.type === 'ALL' &&
      !hasAcFilter;

    if (includeAll || noFiltersActive) {
      baseAirports.forEach((a) => {
        if (filters.continent === 'ALL' || a.continent === filters.continent) {
          visIcaos.add(a.icao);
        }
      });
      matchedRoutes.forEach(({ route }) => {
        visIcaos.add(route.origin);
        visIcaos.add(route.dest);
      });
    } else {
      if (filters.hub !== 'ALL' && map.has(filters.hub)) visIcaos.add(filters.hub);
      matchedRoutes.forEach(({ route }) => {
        visIcaos.add(route.origin);
        visIcaos.add(route.dest);
      });
      if (filters.continent !== 'ALL' && matchedRoutes.length === 0) {
        baseAirports
          .filter((a) => a.continent === filters.continent)
          .forEach((a) => visIcaos.add(a.icao));
      }
    }

    return {
      filteredRoutes: matchedRoutes,
      visibleAirports: baseAirports.filter((a) => visIcaos.has(a.icao)),
      airportByIcao: map,
    };
  }, [
    isAdminUnlocked,
    adminOverlays.showAllAirports,
    sandboxMode,
    activeDataset,
    activeAirportsAll,
    filters,
  ]);

  // Live baseline overlay routes (respects Hub/Continent filters so comparison stays focused)
  const { liveOverlayRoutes, liveAirportByIcao } = useMemo(() => {
    const liveActive = adminOverlays.showAllAirports
      ? networkData.airports
      : networkData.airports.filter((a) => a.active !== false);
    const map = new Map(liveActive.map((a) => [a.icao, a]));
    const filtered = networkData.routes.filter((r) => {
      const o = map.get(r.origin);
      const d = map.get(r.dest);
      if (!o || !d) return false;
      if (filters.hub !== 'ALL' && r.origin !== filters.hub && r.dest !== filters.hub) return false;
      if (
        filters.continent !== 'ALL' &&
        o.continent !== filters.continent &&
        d.continent !== filters.continent
      ) {
        return false;
      }
      return true;
    });
    return { liveOverlayRoutes: filtered, liveAirportByIcao: map };
  }, [networkData, adminOverlays.showAllAirports, filters.hub, filters.continent]);

  // Route count overlays (per airport)
  const liveAirportCounts = useMemo(
    () => computeRouteCountMap(networkData.routes),
    [networkData.routes],
  );
  const activeAirportCounts = useMemo(
    () => computeRouteCountMap(filteredRoutes.map((item) => item.route)),
    [filteredRoutes],
  );
  const fullSandboxCounts = useMemo(
    () => computeRouteCountMap(sandboxNetwork.routes),
    [sandboxNetwork.routes],
  );

  const selectedAirport = useMemo(
    () =>
      selectedAirportIcao
        ? networkData.airports.find((a) => a.icao === selectedAirportIcao) || null
        : null,
    [networkData.airports, selectedAirportIcao],
  );

  const pendingOriginAirport = useMemo(
    () =>
      sandboxPendingOrigin
        ? sandboxNetwork.airports.find((a) => a.icao === sandboxPendingOrigin) || null
        : null,
    [sandboxNetwork.airports, sandboxPendingOrigin],
  );

  // Handlers
  const clearInspector = useCallback(() => {
    setSelectedAirportIcao(null);
    setSelectedRouteKey(null);
    setSelectedRouteObj(null);
  }, []);

  const handleToggleOverlay = useCallback((key: keyof AdminOverlayState) => {
    setAdminOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleToggleSandbox = () => {
    if (!isAdminUnlocked) return;
    if (!sandboxMode) {
      if (!sandboxInitialized) {
        setSandboxNetwork(cloneNetworkData(networkData));
        setSandboxInitialized(true);
        setSandboxUndoStack([]);
        setSandboxRedoStack([]);
      }
      setAdminOverlays((prev) => ({
        ...prev,
        showAirportCounts: true,
        showSandboxRoutes: true,
      }));
      setSandboxTool('draw');
      setSandboxPendingOrigin(null);
      setSandboxSelection(null);
      clearInspector();
      setSandboxMode(true);
    } else {
      setSandboxMode(false);
      setSandboxPendingOrigin(null);
      setSandboxSelection(null);
    }
  };

  const handleSelectAirportOnMap = useCallback(
    (airport: Airport) => {
      if (sandboxMode) {
        if (sandboxTool === 'erase') {
          const connectedCount = sandboxNetwork.routes.filter(
            (r) => r.origin === airport.icao || r.dest === airport.icao,
          ).length;
          updateSandboxNetwork((prev) => ({
            airports: prev.airports.filter((a) => a.icao !== airport.icao),
            routes: prev.routes.filter((r) => r.origin !== airport.icao && r.dest !== airport.icao),
          }));
          setSandboxSelection(null);
          setSandboxPendingOrigin(null);
          pushToast(
            'info',
            `Removed ${formatCityName(airport.city)} (${airport.icao})${
              connectedCount ? ` and ${connectedCount} sector(s)` : ''
            } locally. Press Ctrl+Z to undo.`,
          );
          return;
        }

        if (sandboxTool === 'select') {
          setSandboxSelection({ kind: 'airport', icao: airport.icao });
          return;
        }

        if (sandboxTool === 'draw') {
          if (!sandboxPendingOrigin) {
            setSandboxPendingOrigin(airport.icao);
            return;
          }
          if (sandboxPendingOrigin === airport.icao) {
            setSandboxPendingOrigin(null);
            return;
          }

          const origin = sandboxPendingOrigin;
          const dest = airport.icao;
          const color = isValidHexColor(sandboxColor) ? sandboxColor : DEFAULT_ROUTE_COLOR;

          updateSandboxNetwork((prev) => {
            const newRoute: RouteSector = {
              origin,
              dest,
              aircraftTypes: ['A320neo'],
              type: 'Proposed',
              remarks: '',
              color,
            };
            return { ...prev, routes: [...prev.routes, newRoute] };
          });
          setSandboxPendingOrigin(null);
          pushToast('success', `Added local route ${origin} → ${dest}. Click it to edit details.`);
          return;
        }
        return;
      }

      setSelectedAirportIcao(airport.icao);
      setSelectedRouteKey(null);
      setSelectedRouteObj(null);
    },
    [
      sandboxMode,
      sandboxTool,
      sandboxNetwork.routes,
      sandboxPendingOrigin,
      sandboxColor,
      updateSandboxNetwork,
      pushToast,
    ],
  );

  const handleSelectRouteOnMap = useCallback(
    (route: RouteSector, sourceIndex: number, routeKey: string) => {
      if (sandboxMode) {
        if (sandboxTool === 'erase') {
          updateSandboxNetwork((prev) => ({
            ...prev,
            routes: prev.routes.filter((_, idx) => idx !== sourceIndex),
          }));
          setSandboxSelection(null);
          pushToast('info', `Removed ${route.origin} → ${route.dest} locally. Ctrl+Z to undo.`);
          return;
        }

        setSandboxPendingOrigin(null);
        setSandboxSelection({ kind: 'route', routeIndex: sourceIndex });
        return;
      }

      setSelectedAirportIcao(null);
      setSelectedRouteKey(routeKey);
      setSelectedRouteObj(route);
    },
    [sandboxMode, sandboxTool, updateSandboxNetwork, pushToast],
  );

  const handleBackgroundClick = useCallback(() => {
    if (sandboxMode) {
      if (sandboxPendingOrigin) setSandboxPendingOrigin(null);
      if (sandboxSelection) setSandboxSelection(null);
      return;
    }
    clearInspector();
  }, [sandboxMode, sandboxPendingOrigin, sandboxSelection, clearInspector]);

  const handleJumpToAirport = useCallback(
    (airport: Airport) => {
      mapRef.current?.flyToAirport(airport);
      if (sandboxMode) {
        setSandboxSelection({ kind: 'airport', icao: airport.icao });
      } else {
        setSelectedAirportIcao(airport.icao);
        setSelectedRouteKey(null);
        setSelectedRouteObj(null);
      }
    },
    [sandboxMode],
  );

  // Sandbox Item Panel Save/Delete handlers
  const handleSaveSandboxAirport = (airport: Airport, previousIcao?: string) => {
    updateSandboxNetwork((prev) => {
      const nextAirports = [...prev.airports];
      let nextRoutes = [...prev.routes];

      if (previousIcao && previousIcao !== airport.icao) {
        const oldIdx = nextAirports.findIndex((a) => a.icao === previousIcao);
        if (oldIdx >= 0) nextAirports.splice(oldIdx, 1);
        nextRoutes = nextRoutes.map((r) => ({
          ...r,
          origin: r.origin === previousIcao ? airport.icao : r.origin,
          dest: r.dest === previousIcao ? airport.icao : r.dest,
        }));
      }

      const existingIdx = nextAirports.findIndex((a) => a.icao === airport.icao);
      if (existingIdx >= 0) {
        nextAirports[existingIdx] = airport;
      } else {
        nextAirports.push(airport);
      }
      return { airports: nextAirports, routes: nextRoutes };
    });

    setSandboxSelection({ kind: 'airport', icao: airport.icao });
    if (sandboxTool === 'add-airport') {
      setSandboxTool('draw');
    }
    pushToast(
      'success',
      previousIcao
        ? `Updated ${formatCityName(airport.city)} (${airport.icao}) in Edit Mode.`
        : `Added ${formatCityName(airport.city)} (${airport.icao}) to Edit Mode.`,
    );
  };

  const handleDeleteSandboxAirport = (icao: string) => {
    updateSandboxNetwork((prev) => ({
      airports: prev.airports.filter((a) => a.icao !== icao),
      routes: prev.routes.filter((r) => r.origin !== icao && r.dest !== icao),
    }));
    setSandboxSelection(null);
    pushToast('info', `Removed ${icao} from Edit Mode. Press Ctrl+Z to undo.`);
  };

  const handleSaveSandboxRoute = (route: RouteSector, routeIndex: number) => {
    updateSandboxNetwork((prev) => {
      const nextRoutes = [...prev.routes];
      if (routeIndex >= 0 && routeIndex < nextRoutes.length) {
        nextRoutes[routeIndex] = route;
      }
      return { ...prev, routes: nextRoutes };
    });
    pushToast('success', `Updated local sector ${route.origin} → ${route.dest}.`);
  };

  const handleDeleteSandboxRoute = (routeIndex: number) => {
    const target = sandboxNetwork.routes[routeIndex];
    updateSandboxNetwork((prev) => ({
      ...prev,
      routes: prev.routes.filter((_, idx) => idx !== routeIndex),
    }));
    setSandboxSelection(null);
    if (target) {
      pushToast('info', `Deleted ${target.origin} → ${target.dest} locally.`);
    }
  };

  const handleResetSandboxToLive = () => {
    updateSandboxNetwork(() => cloneNetworkData(networkData));
    setSandboxSelection(null);
    setSandboxPendingOrigin(null);
    pushToast('info', 'Reset Edit Mode workspace to live database.');
  };

  const handleClearSandboxRoutes = () => {
    updateSandboxNetwork((prev) => ({ ...prev, routes: [] }));
    setSandboxSelection(null);
    setSandboxPendingOrigin(null);
    pushToast('info', 'Cleared all routes in Edit Mode. Press Ctrl+Z to undo.');
  };

  const handleSandboxExport = () => {
    const payload = {
      editMode: true,
      exportedAt: new Date().toISOString(),
      defaultColor: sandboxColor,
      airports: sandboxNetwork.airports,
      routes: sandboxNetwork.routes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deat-edit-mode-network.json';
    a.click();
    URL.revokeObjectURL(url);
    pushToast('info', 'Exported Edit Mode JSON.');
  };

  const handleSandboxImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Support both full network JSON ({ airports, routes } or { payload: ... }) and legacy routes-only JSON
      const sourceObj =
        parsed && typeof parsed === 'object' && 'payload' in parsed && parsed.payload
          ? parsed.payload
          : parsed;

      const hasAirports = sourceObj && Array.isArray(sourceObj.airports);
      const rawRoutes = Array.isArray(sourceObj)
        ? sourceObj
        : sourceObj && Array.isArray(sourceObj.routes)
          ? sourceObj.routes
          : null;

      if (!hasAirports && !rawRoutes) {
        throw new Error("Imported JSON must contain 'routes' and/or 'airports' arrays.");
      }

      // Sanitize against combined airport list (file airports + current Edit Mode airports) so routes resolve cleanly
      const combinedAirports = hasAirports
        ? [...sandboxNetwork.airports, ...sourceObj.airports]
        : sandboxNetwork.airports;
      const sanitizedCombined = sanitizeNetworkPayload({
        airports: combinedAirports,
        routes: rawRoutes || [],
      });
      const sanitizedFileAirports = hasAirports
        ? sanitizeNetworkPayload({ airports: sourceObj.airports, routes: [] }).airports
        : null;

      setPendingImport({
        fileName: file.name,
        airports: sanitizedFileAirports,
        routes: sanitizedCombined.routes,
        defaultColor:
          sourceObj && isValidHexColor(sourceObj.defaultColor)
            ? sourceObj.defaultColor
            : undefined,
      });
    } catch (err: unknown) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Failed to parse imported JSON file.',
      );
    }
  };

  const handleConfirmImport = (strategy: ImportStrategy) => {
    if (!pendingImport) return;
    if (pendingImport.defaultColor) {
      setSandboxColor(pendingImport.defaultColor);
    }

    if (strategy === 'keep-and-merge') {
      const { merged, addedAirports, addedRoutes } = mergeImportedIntoWorkspace(
        sandboxNetwork,
        pendingImport.airports,
        pendingImport.routes,
      );
      updateSandboxNetwork(() => merged);
      pushToast(
        'success',
        `Imported +${addedRoutes} route(s)${
          addedAirports ? ` and +${addedAirports} airport(s)` : ''
        } while keeping existing routes.`,
      );
    } else {
      // Option B: Replace old routes (and airports if included in file)
      const replacementAirports = pendingImport.airports
        ? pendingImport.airports
        : sandboxNetwork.airports;
      const sanitized = sanitizeNetworkPayload({
        airports: replacementAirports,
        routes: pendingImport.routes,
      });
      updateSandboxNetwork(() => sanitized);
      pushToast(
        'success',
        `Replaced old routes with ${sanitized.routes.length} imported route(s).`,
      );
    }

    setPendingImport(null);
    setSandboxPendingOrigin(null);
    setSandboxSelection(null);
  };

  const handlePublishSandbox = async (strategy: PublishStrategy) => {
    setPublishing(true);
    try {
      const targetPayload =
        strategy === 'add-new-only'
          ? mergeNewItemsIntoLive(networkData, sandboxNetwork).merged
          : cloneNetworkData(sandboxNetwork);

      if (firebaseReady) {
        setSyncState('saving');
        setSyncText('Publishing');
        await publishNetworkState(targetPayload, currentUser);
        const published = cloneNetworkData(targetPayload);
        setNetworkData(published);
        setDraft(cloneNetworkData(published));
        setSandboxNetwork(cloneNetworkData(published));
        setUndoStack([]);
        setRedoStack([]);
        setSandboxUndoStack([]);
        setSandboxRedoStack([]);
        setRemoteConflict(false);
        setSyncState('synced');
        setSyncText('Live');
        setPublishSandboxOpen(false);
        pushToast(
          'success',
          strategy === 'add-new-only'
            ? 'Added new Edit Mode routes/airports to live map (existing routes kept).'
            : 'Published Edit Mode state and updated live map.',
        );
      } else {
        const cleaned = cloneNetworkData(targetPayload);
        setNetworkData(cleaned);
        setDraft(cloneNetworkData(cleaned));
        setSandboxNetwork(cloneNetworkData(cleaned));
        setSandboxUndoStack([]);
        setSandboxRedoStack([]);
        try {
          localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(cleaned));
        } catch {
          // ignore
        }
        setPublishSandboxOpen(false);
        pushToast(
          'success',
          strategy === 'add-new-only'
            ? 'Added new routes/airports to local preview (existing routes kept).'
            : 'Applied Edit Mode state to local preview.',
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish Edit Mode changes.';
      if (firebaseReady) {
        setSyncState('error');
        setSyncText('Publish Err');
      }
      pushToast('error', msg);
    } finally {
      setPublishing(false);
    }
  };

  const handleOpenSandboxInEditor = () => {
    setDraft(cloneNetworkData(sandboxNetwork));
    setUndoStack([]);
    setRedoStack([]);
    setPublishSandboxOpen(false);
    setSandboxMode(false);
    setSandboxSelection(null);
    setSandboxPendingOrigin(null);
    setEditorOpen(true);
    pushToast('info', 'Loaded Edit Mode draft into Network Editor.');
  };

  // Network Editor handlers
  const handleOpenEditor = () => {
    if (firebaseReady && !currentUser) {
      setAuthOpen(true);
      return;
    }
    if (!isDirty) {
      setDraft(cloneNetworkData(networkData));
      setUndoStack([]);
      setRedoStack([]);
    }
    setEditorOpen(true);
  };

  const handleAdminSignIn = async (email: string, password: string) => {
    await signInAdmin(email, password);
    setAuthOpen(false);
    setDraft(cloneNetworkData(networkData));
    setUndoStack([]);
    setRedoStack([]);
    setEditorOpen(true);
    pushToast('success', 'Signed in to DEAT Admin.');
  };

  const handleAdminSignOut = async () => {
    await signOutAdmin();
    setEditorOpen(false);
    setSandboxMode(false);
    setSandboxSelection(null);
    setPublishSandboxOpen(false);
    setAdminOverlays({
      showLiveRoutes: true,
      showSandboxRoutes: true,
      showAirportCounts: false,
      showAllAirports: false,
    });
    pushToast('info', 'Signed out of admin session.');
  };

  const handleUpdateDraft = useCallback(
    (updater: (prev: NetworkData) => NetworkData) => {
      setDraft((prev) => {
        const next = updater(prev);
        setUndoStack((stack) => [...stack.slice(-29), cloneNetworkData(prev)]);
        setRedoStack([]);
        return next;
      });
    },
    [],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setDraft((curr) => {
        setRedoStack((r) => [...r, cloneNetworkData(curr)]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setDraft((curr) => {
        setUndoStack((u) => [...u, cloneNetworkData(curr)]);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const handleDiscardDraft = useCallback(() => {
    setDraft(cloneNetworkData(networkData));
    setUndoStack([]);
    setRedoStack([]);
    setRemoteConflict(false);
    pushToast('info', 'Reverted draft to published network.');
  }, [networkData, pushToast]);

  const handleReloadRemote = useCallback(() => {
    const src = latestRemoteData || networkData;
    setDraft(cloneNetworkData(src));
    setUndoStack([]);
    setRedoStack([]);
    setRemoteConflict(false);
    pushToast('info', 'Loaded latest remote network from Firebase.');
  }, [latestRemoteData, networkData, pushToast]);

  const handlePublishEditor = async () => {
    setPublishing(true);
    try {
      if (firebaseReady) {
        setSyncState('saving');
        setSyncText('Publishing');
        await publishNetworkState(draft, currentUser);
        setNetworkData(cloneNetworkData(draft));
        setUndoStack([]);
        setRedoStack([]);
        setRemoteConflict(false);
        setSyncState('synced');
        setSyncText('Live');
        setEditorOpen(false);
        pushToast('success', 'Network changes published to Firebase.');
      } else {
        const cleaned = cloneNetworkData(draft);
        setNetworkData(cleaned);
        setUndoStack([]);
        setRedoStack([]);
        try {
          localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(cleaned));
        } catch {
          // ignore
        }
        setEditorOpen(false);
        pushToast('success', 'Changes applied to local preview network.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish network changes.';
      if (firebaseReady) {
        setSyncState('error');
        setSyncText('Publish Err');
      }
      pushToast('error', msg);
    } finally {
      setPublishing(false);
    }
  };

  const effectiveSyncState: SyncState = sandboxMode ? 'local' : syncState;
  const effectiveSyncText = sandboxMode ? 'Edit Mode (Local)' : syncText;

  const activeSelectedAirportIcao = sandboxMode
    ? sandboxSelection?.kind === 'airport'
      ? sandboxSelection.icao
      : null
    : selectedAirportIcao;

  const activeSelectedRouteKey = sandboxMode
    ? sandboxSelection?.kind === 'route' && sandboxNetwork.routes[sandboxSelection.routeIndex]
      ? `${sandboxNetwork.routes[sandboxSelection.routeIndex].origin}->${sandboxNetwork.routes[sandboxSelection.routeIndex].dest}#${sandboxSelection.routeIndex}`
      : null
    : selectedRouteKey;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* Full-Bleed Memoized D3 Cartographic Canvas */}
      <NetworkMap
        ref={mapRef}
        visibleAirports={visibleAirports}
        airportByIcao={airportByIcao}
        filteredRoutes={filteredRoutes}
        liveOverlayRoutes={liveOverlayRoutes}
        liveAirportByIcao={liveAirportByIcao}
        showLiveRoutesOverlay={Boolean(isAdminUnlocked && sandboxMode && adminOverlays.showLiveRoutes)}
        showSandboxRoutes={adminOverlays.showSandboxRoutes}
        showAirportCounts={Boolean(isAdminUnlocked && adminOverlays.showAirportCounts)}
        airportCounts={activeAirportCounts}
        liveAirportCounts={liveAirportCounts}
        sandboxMode={sandboxMode}
        sandboxTool={sandboxTool}
        sandboxPendingOrigin={sandboxPendingOrigin}
        sandboxDrawColor={sandboxColor}
        addedAirportIcaos={sandboxDiff.addedAirportIcaos}
        modifiedAirportIcaos={sandboxDiff.modifiedAirportIcaos}
        selectedAirportIcao={activeSelectedAirportIcao}
        selectedRouteKey={activeSelectedRouteKey}
        darkMode={darkMode}
        pinPickerActive={pinPickerActive}
        onSelectAirport={handleSelectAirportOnMap}
        onSelectRoute={handleSelectRouteOnMap}
        onBackgroundClick={handleBackgroundClick}
        onPickCoordinates={(coords) => {
          if (pinPickerActive) {
            setPickedCoords(coords);
            setPinPickerActive(false);
            setEditorOpen(true);
            pushToast(
              'info',
              `Picked ${coords.lat.toFixed(4)}°, ${coords.lon.toFixed(4)}° (${coords.continent})`,
            );
          } else if (sandboxMode && sandboxTool === 'add-airport') {
            setSandboxSelection({
              kind: 'new-airport',
              lat: coords.lat,
              lon: coords.lon,
              continent: coords.continent,
            });
          }
        }}
        onCancelPinPicker={() => {
          setPinPickerActive(false);
          setEditorOpen(true);
        }}
      />

      {/* Unified Responsive Top Bar */}
      <TopBar
        airports={activeDataset.airports}
        hubs={hubs}
        routeTypes={allRouteTypes}
        aircraftTypes={allAircraftTypes}
        activeAirportCount={activeAirportsAll.length}
        totalAirportCount={activeDataset.airports.length}
        routeCount={activeDataset.routes.length}
        sandboxMode={sandboxMode}
        sandboxRouteCount={sandboxNetwork.routes.length}
        isAdminUnlocked={isAdminUnlocked}
        syncState={effectiveSyncState}
        syncText={effectiveSyncText}
        filters={filters}
        onChangeFilter={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onResetFilters={() =>
          setFilters({
            hub: 'ALL',
            continent: 'ALL',
            type: 'ALL',
            aircraftTypes: new Set(),
          })
        }
        onJumpToAirport={handleJumpToAirport}
        onToggleSandbox={handleToggleSandbox}
        onOpenEditor={handleOpenEditor}
      />

      {/* Redesigned Sandbox Studio Bar & Bottom Dock (Admin-only) */}
      {isAdminUnlocked && (
        <SandboxBar
          active={sandboxMode}
          tool={sandboxTool}
          pendingOrigin={pendingOriginAirport}
          routeColor={sandboxColor}
          routeCount={sandboxNetwork.routes.length}
          diff={sandboxDiff}
          overlays={adminOverlays}
          canUndo={sandboxUndoStack.length > 0}
          canRedo={sandboxRedoStack.length > 0}
          firebaseReady={firebaseReady}
          onChangeTool={(nextTool) => {
            setSandboxTool(nextTool);
            setSandboxPendingOrigin(null);
            if (nextTool === 'erase' || nextTool === 'add-airport') {
              setSandboxSelection(null);
            }
          }}
          onChangeColor={(col) => setSandboxColor(col)}
          onToggleOverlay={handleToggleOverlay}
          onUndo={handleSandboxUndo}
          onRedo={handleSandboxRedo}
          onImportFile={handleSandboxImport}
          onExport={handleSandboxExport}
          onClearRoutes={handleClearSandboxRoutes}
          onResetToLive={handleResetSandboxToLive}
          onOpenPublish={() => setPublishSandboxOpen(true)}
          onExit={() => {
            setSandboxMode(false);
            setSandboxPendingOrigin(null);
            setSandboxSelection(null);
          }}
        />
      )}

      {/* Inline Sandbox Station & Route Editor Panel (Admin-only) */}
      {isAdminUnlocked && sandboxMode && !pinPickerActive && (
        <SandboxItemPanel
          selection={sandboxSelection}
          sandboxAirports={sandboxNetwork.airports}
          sandboxRoutes={sandboxNetwork.routes}
          liveCounts={liveAirportCounts}
          sandboxCounts={fullSandboxCounts}
          addedAirportIcaos={sandboxDiff.addedAirportIcaos}
          modifiedAirportIcaos={sandboxDiff.modifiedAirportIcaos}
          addedRouteSignatures={sandboxDiff.addedRouteSignatures}
          modifiedRouteSignatures={sandboxDiff.modifiedRouteSignatures}
          routeSignatureFn={getRouteContentSignature}
          onSaveAirport={handleSaveSandboxAirport}
          onDeleteAirport={handleDeleteSandboxAirport}
          onSaveRoute={handleSaveSandboxRoute}
          onDeleteRoute={handleDeleteSandboxRoute}
          onSelectRouteIndex={(idx) => setSandboxSelection({ kind: 'route', routeIndex: idx })}
          onSelectAirportIcao={(icao) => setSandboxSelection({ kind: 'airport', icao })}
          onClose={() => setSandboxSelection(null)}
        />
      )}

      {/* Public Station & Flight Sector Inspector Panel */}
      {!sandboxMode && !pinPickerActive && (
        <InspectorPanel
          selectedAirport={selectedAirport}
          selectedRoute={selectedRouteObj}
          allAirports={networkData.airports}
          allRoutes={networkData.routes}
          onSelectAirport={(ap) => {
            setSelectedAirportIcao(ap.icao);
            setSelectedRouteKey(null);
            setSelectedRouteObj(null);
          }}
          onSelectRoute={(route, key) => {
            setSelectedAirportIcao(null);
            setSelectedRouteKey(key);
            setSelectedRouteObj(route);
          }}
          onFocusAirport={(ap) => mapRef.current?.flyToAirport(ap)}
          onClose={clearInspector}
        />
      )}

      {/* Bottom-Left Cartographic Legend */}
      <div className="fixed bottom-3 left-3 sm:left-4 z-20 hidden sm:flex h-8 items-center gap-3.5 rounded border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm px-3 font-mono text-[10.5px] text-[var(--ink-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[#EE1C25] bg-[var(--marker-fill)]" />
          Hub
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border-[1.5px] border-[#EE1C25] bg-[var(--marker-fill)]" />
          Station
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-[#EE1C25]" />
          Sector
        </span>
        {isAdminUnlocked && sandboxMode && adminOverlays.showLiveRoutes && (
          <span className="inline-flex items-center gap-1.5 border-l border-[var(--border)] pl-3">
            <span className="w-4 border-t-[1.5px] border-dashed border-slate-500 dark:border-slate-400" />
            Live Ref
          </span>
        )}
      </div>

      {/* Bottom-Right Admin Overlays, Zoom & Theme Strip */}
      <div className="fixed bottom-3 right-3 sm:right-4 z-20 flex h-8 items-center overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm">
        {isAdminUnlocked && (
          <>
            <button
              type="button"
              onClick={() => handleToggleOverlay('showAirportCounts')}
              aria-pressed={adminOverlays.showAirportCounts}
              title="Toggle sector count numbers above airports (Admin only)"
              className={`inline-flex h-full items-center gap-1.5 border-r border-[var(--border)] px-2.5 font-mono text-[10.5px] font-semibold transition-colors whitespace-nowrap ${
                adminOverlays.showAirportCounts
                  ? 'bg-[var(--surface-alt)] text-amber-700 dark:text-amber-400'
                  : 'text-[var(--ink)] hover:bg-[var(--surface-alt)]'
              }`}
            >
              <Hash className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Counts</span>
            </button>

            <button
              type="button"
              onClick={() => handleToggleOverlay('showAllAirports')}
              aria-pressed={adminOverlays.showAllAirports}
              title="Show inactive and filtered airports on the map (Admin only)"
              className={`inline-flex h-full items-center gap-1.5 border-r border-[var(--border)] px-2.5 font-mono text-[10.5px] font-semibold transition-colors whitespace-nowrap ${
                adminOverlays.showAllAirports
                  ? 'bg-[var(--surface-alt)] text-[#EE1C25]'
                  : 'text-[var(--ink)] hover:bg-[var(--surface-alt)]'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden md:inline">All Airports</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          title="Zoom in"
          aria-label="Zoom in"
          className="inline-flex h-full w-8 items-center justify-center border-r border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-alt)]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          title="Zoom out"
          aria-label="Zoom out"
          className="inline-flex h-full w-8 items-center justify-center border-r border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-alt)]"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => mapRef.current?.resetZoom()}
          title="Reset global view"
          aria-label="Reset global view"
          className="inline-flex h-full items-center gap-1 border-r border-[var(--border)] px-2.5 font-mono text-[10.5px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-alt)] whitespace-nowrap"
        >
          <RotateCcw className="h-3 w-3" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex h-full items-center gap-1.5 px-2.5 font-mono text-[10.5px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-alt)] whitespace-nowrap"
        >
          {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{darkMode ? 'Light' : 'Dark'}</span>
        </button>
      </div>

      {/* Admin Email/Password Sign-In Modal */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSignIn={handleAdminSignIn}
      />

      {/* Import Mode Choice Modal (Admin-only) */}
      {isAdminUnlocked && (
        <ImportEditModeModal
          pending={pendingImport}
          currentAirportCount={sandboxNetwork.airports.length}
          currentRouteCount={sandboxNetwork.routes.length}
          onConfirm={handleConfirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {/* Publish Edit Mode Strategy & Diff Modal (Admin-only) */}
      {isAdminUnlocked && (
        <PublishSandboxModal
          open={publishSandboxOpen}
          firebaseReady={firebaseReady}
          diff={sandboxDiff}
          liveAirportCount={networkData.airports.length}
          liveRouteCount={networkData.routes.length}
          addOnlyAirports={addOnlyPreview.addedAirports}
          addOnlyRoutes={addOnlyPreview.addedRoutes}
          publishing={publishing}
          onConfirmPublish={handlePublishSandbox}
          onOpenInEditor={handleOpenSandboxInEditor}
          onClose={() => setPublishSandboxOpen(false)}
        />
      )}

      {/* Network Editor Modal */}
      <NetworkEditorModal
        open={editorOpen}
        firebaseReady={firebaseReady}
        adminEmail={currentUser?.email || null}
        draft={draft}
        isDirty={isDirty}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        remoteConflict={remoteConflict}
        publishing={publishing}
        pickedCoords={pickedCoords}
        onClearPickedCoords={() => setPickedCoords(null)}
        onStartPinPicker={() => {
          setEditorOpen(false);
          setPinPickerActive(true);
        }}
        onUpdateDraft={handleUpdateDraft}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDiscardDraft={handleDiscardDraft}
        onReloadRemote={handleReloadRemote}
        onDismissConflict={() => setRemoteConflict(false)}
        onPublish={handlePublishEditor}
        onSignOut={handleAdminSignOut}
        onClose={() => setEditorOpen(false)}
        onNotify={pushToast}
      />

      {/* Accessible Non-Blocking Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
