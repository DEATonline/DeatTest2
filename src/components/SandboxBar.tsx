import React, { useRef } from 'react';
import {
  CloudUpload,
  Download,
  Eraser,
  Hash,
  Layers,
  MapPinPlus,
  MousePointer2,
  PenTool,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  AdminOverlayState,
  Airport,
  NetworkDiffSummary,
  SANDBOX_COLOR_PRESETS,
  SandboxTool,
} from '../types/network';
import { formatCityName } from '../utils/networkUtils';

interface SandboxBarProps {
  active: boolean;
  tool: SandboxTool;
  pendingOrigin: Airport | null;
  routeColor: string;
  routeCount: number;
  diff: NetworkDiffSummary;
  overlays: AdminOverlayState;
  canUndo: boolean;
  canRedo: boolean;
  firebaseReady: boolean;
  onChangeTool: (tool: SandboxTool) => void;
  onChangeColor: (color: string) => void;
  onToggleOverlay: (key: keyof AdminOverlayState) => void;
  onUndo: () => void;
  onRedo: () => void;
  onImportFile: (file: File) => void;
  onExport: () => void;
  onClearRoutes: () => void;
  onResetToLive: () => void;
  onOpenPublish: () => void;
  onExit: () => void;
}

export function SandboxBar({
  active,
  tool,
  pendingOrigin,
  routeColor,
  routeCount,
  diff,
  overlays,
  canUndo,
  canRedo,
  firebaseReady,
  onChangeTool,
  onChangeColor,
  onToggleOverlay,
  onUndo,
  onRedo,
  onImportFile,
  onExport,
  onClearRoutes,
  onResetToLive,
  onOpenPublish,
  onExit,
}: SandboxBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!active) return null;

  const toolHint = () => {
    if (tool === 'draw') {
      if (pendingOrigin) {
        return (
          <>
            Origin:{' '}
            <strong className="text-amber-700 dark:text-amber-400">
              {formatCityName(pendingOrigin.city)} ({pendingOrigin.icao})
            </strong>{' '}
            — click destination station (Esc to cancel)
          </>
        );
      }
      return 'Click airport A → B to brainstorm a new route · Click any route to edit';
    }
    if (tool === 'select') {
      return 'Click any airport or flight sector to edit properties, aircraft, or status';
    }
    if (tool === 'add-airport') {
      return 'Click anywhere on the map to place a new local airport';
    }
    return 'Click any route or station on the map to remove it locally';
  };

  const diffSummaryText =
    diff.totalChanges === 0
      ? 'Matches live database'
      : [
          diff.airportsAdded.length ? `+${diff.airportsAdded.length} ap` : '',
          diff.airportsModified.length ? `~${diff.airportsModified.length} ap` : '',
          diff.airportsRemoved.length ? `-${diff.airportsRemoved.length} ap` : '',
          diff.routesAdded.length ? `+${diff.routesAdded.length} rt` : '',
          diff.routesModified.length ? `~${diff.routesModified.length} rt` : '',
          diff.routesRemoved.length ? `-${diff.routesRemoved.length} rt` : '',
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <>
      {/* Slim contextual banner directly under TopBar (zero collision) */}
      <div
        role="status"
        aria-live="polite"
        className="fixed top-13 inset-x-0 z-20 flex items-center justify-between gap-3 border-b border-amber-500/70 bg-[var(--sandbox-bg)] px-3 sm:px-4 py-1.5 text-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10.5px] font-bold tracking-wide text-amber-700 dark:text-amber-400 shrink-0">
            EDIT MODE
          </span>
          <span aria-hidden="true" className="text-amber-600/50">
            ·
          </span>
          <span className="truncate font-mono text-[11px] text-[var(--ink-secondary)]">
            {toolHint()}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden lg:inline font-mono text-[10.5px] tabular-nums text-amber-800 dark:text-amber-300">
            {diffSummaryText}
          </span>
          <div className="flex items-center rounded border border-amber-500/40 bg-[var(--surface)]">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo Edit Mode change (Ctrl+Z)"
              aria-label="Undo Edit Mode change"
              className="inline-flex h-6 w-7 items-center justify-center border-r border-amber-500/30 text-[var(--ink)] hover:bg-[var(--surface-alt)] disabled:opacity-35"
            >
              <Undo2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo Edit Mode change (Ctrl+Shift+Z)"
              aria-label="Redo Edit Mode change"
              className="inline-flex h-6 w-7 items-center justify-center text-[var(--ink)] hover:bg-[var(--surface-alt)] disabled:opacity-35"
            >
              <Redo2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Edit Mode Dock */}
      <div
        role="region"
        aria-label="Edit Mode tools and overlays"
        className="fixed bottom-13 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-2 rounded border border-amber-500 bg-[var(--surface)]/95 backdrop-blur-sm px-2.5 py-1.5 shadow-md max-w-[calc(100vw-20px)]"
      >
        {/* Tool Selector */}
        <div
          role="group"
          aria-label="Edit Mode tools"
          className="flex items-center rounded border border-[var(--border)] bg-[var(--surface-alt)] p-0.5"
        >
          {(
            [
              { id: 'draw', label: 'Draw', icon: PenTool, title: 'Brainstorm: click airport A → B to add route' },
              { id: 'select', label: 'Edit', icon: MousePointer2, title: 'Click any airport or route to edit' },
              { id: 'add-airport', label: 'Airport', icon: MapPinPlus, title: 'Click map to place a new airport' },
              { id: 'erase', label: 'Erase', icon: Eraser, title: 'Click any route or station to delete' },
            ] as const
          ).map(({ id, label, icon: Icon, title }) => {
            const selected = tool === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeTool(id)}
                title={title}
                aria-pressed={selected}
                className={`inline-flex h-7 items-center gap-1 rounded px-2 font-mono text-[10.5px] font-semibold transition-colors whitespace-nowrap ${
                  selected
                    ? 'bg-amber-600 text-white'
                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </div>

        <span className="hidden md:inline-block h-5 w-px bg-[var(--border)]" />

        {/* Draw Color Picker & Presets */}
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={routeColor}
            onChange={(e) => onChangeColor(e.target.value)}
            title="New brainstorm route color"
            aria-label="New route color"
            className="h-7 w-7 cursor-pointer rounded border border-[var(--border-strong)] bg-transparent p-0.5"
          />
          <div className="hidden sm:flex items-center gap-1">
            {SANDBOX_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => onChangeColor(preset.hex)}
                title={preset.label}
                aria-label={`Set draw color ${preset.label}`}
                className={`h-4 w-4 rounded-sm border transition-transform ${
                  routeColor.toLowerCase() === preset.hex.toLowerCase()
                    ? 'scale-115 border-[var(--ink)] ring-1 ring-[var(--ink)]'
                    : 'border-black/25'
                }`}
                style={{ backgroundColor: preset.hex }}
              />
            ))}
          </div>
        </div>

        <span className="hidden md:inline-block h-5 w-px bg-[var(--border)]" />

        {/* Overlay Toggles */}
        <div
          role="group"
          aria-label="Map overlays"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            onClick={() => onToggleOverlay('showLiveRoutes')}
            aria-pressed={overlays.showLiveRoutes}
            title="Overlay current live database routes as dashed reference lines"
            className={`inline-flex h-7 items-center gap-1 rounded border px-2 font-mono text-[10.5px] font-semibold transition-colors whitespace-nowrap ${
              overlays.showLiveRoutes
                ? 'border-[#EE1C25] bg-red-500/10 text-[#EE1C25]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Live Overlay</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleOverlay('showAirportCounts')}
            aria-pressed={overlays.showAirportCounts}
            title="Toggle sector count numbers (and live deltas) above airports"
            className={`inline-flex h-7 items-center gap-1 rounded border px-2 font-mono text-[10.5px] font-semibold transition-colors whitespace-nowrap ${
              overlays.showAirportCounts
                ? 'border-amber-600 bg-amber-500/12 text-amber-700 dark:text-amber-400'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)]'
            }`}
          >
            <Hash className="h-3.5 w-3.5" />
            <span>Counts</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleOverlay('showSandboxRoutes')}
            aria-pressed={overlays.showSandboxRoutes}
            title="Show or hide your Edit Mode routes to compare cleanly against the live overlay"
            className={`hidden xl:inline-flex h-7 items-center rounded border px-2 font-mono text-[10.5px] font-semibold transition-colors whitespace-nowrap ${
              overlays.showSandboxRoutes
                ? 'border-[var(--border-strong)] bg-[var(--surface-alt)] text-[var(--ink)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] line-through'
            }`}
          >
            Draft Routes
          </button>
        </div>

        <span className="hidden md:inline-block h-5 w-px bg-[var(--border)]" />

        {/* File & Workspace Actions */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportFile(file);
            e.target.value = '';
          }}
        />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import routes JSON into Edit Mode"
            className="inline-flex h-7 items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-[10.5px] text-[var(--ink)] hover:bg-[var(--surface-alt)]"
          >
            <Upload className="h-3 w-3" />
            <span className="hidden xl:inline">Import</span>
          </button>

          <button
            type="button"
            onClick={onExport}
            title="Export Edit Mode JSON"
            className="inline-flex h-7 items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-[10.5px] text-[var(--ink)] hover:bg-[var(--surface-alt)]"
          >
            <Download className="h-3 w-3" />
            <span className="hidden xl:inline">Export</span>
          </button>

          <button
            type="button"
            onClick={onClearRoutes}
            disabled={routeCount === 0}
            title="Clear all routes in Edit Mode for blank-slate brainstorming"
            className="inline-flex h-7 items-center gap-1 rounded border border-red-500/35 px-2 font-mono text-[10.5px] text-[var(--err)] hover:bg-red-500/10 disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            <span className="hidden lg:inline">Clear Routes</span>
          </button>

          <button
            type="button"
            onClick={onResetToLive}
            disabled={diff.totalChanges === 0}
            title="Reset Edit Mode workspace back to the current live database"
            className="inline-flex h-7 items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-[10.5px] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden xl:inline">Reset</span>
          </button>
        </div>

        {/* Publish & Exit */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={diff.totalChanges === 0}
            onClick={onOpenPublish}
            title={
              firebaseReady
                ? 'Choose how to publish Edit Mode changes to the live map'
                : 'Choose how to apply Edit Mode changes locally'
            }
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[#EE1C25] px-2.5 font-mono text-[10.5px] font-semibold text-white hover:bg-[#cc121a] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <CloudUpload className="h-3.5 w-3.5" />
            <span>
              Publish{diff.totalChanges > 0 ? ` (${diff.totalChanges})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={onExit}
            title="Exit Edit Mode (local draft stays saved until reset)"
            className="inline-flex h-7 items-center gap-1 rounded border border-[var(--border-strong)] bg-[var(--surface-alt)] px-2 font-mono text-[10.5px] font-semibold text-[var(--ink)] hover:bg-[var(--border)]/40 whitespace-nowrap"
          >
            <X className="h-3.5 w-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>
    </>
  );
}
