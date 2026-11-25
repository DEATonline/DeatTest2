import React, { useEffect, useState } from 'react';
import { Layers, Replace, Upload, X } from 'lucide-react';
import { Airport, RouteSector } from '../types/network';

export type ImportStrategy = 'keep-and-merge' | 'replace-old';

export interface PendingImportPayload {
  fileName: string;
  airports: Airport[] | null;
  routes: RouteSector[];
  defaultColor?: string;
}

interface ImportEditModeModalProps {
  pending: PendingImportPayload | null;
  currentAirportCount: number;
  currentRouteCount: number;
  onConfirm: (strategy: ImportStrategy) => void;
  onCancel: () => void;
}

export function ImportEditModeModal({
  pending,
  currentAirportCount,
  currentRouteCount,
  onConfirm,
  onCancel,
}: ImportEditModeModalProps) {
  const [strategy, setStrategy] = useState<ImportStrategy>('keep-and-merge');

  useEffect(() => {
    if (!pending) return;
    setStrategy('keep-and-merge');
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pending, onCancel]);

  if (!pending) return null;

  const incomingAirportCount = pending.airports ? pending.airports.length : 0;
  const incomingRouteCount = pending.routes.length;

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-mode-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded border border-[var(--border-strong)] bg-[var(--surface)] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-alt)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h2
              id="import-mode-title"
              className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
            >
              Import into Edit Mode
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel import"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded border border-[var(--border)] bg-[var(--surface-alt)] px-3.5 py-2.5 text-xs">
            <div className="font-semibold text-[var(--ink)] truncate">{pending.fileName}</div>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
              File contains {incomingRouteCount} {incomingRouteCount === 1 ? 'route' : 'routes'}
              {pending.airports
                ? ` · ${incomingAirportCount} ${incomingAirportCount === 1 ? 'airport' : 'airports'}`
                : ' (routes only)'}
              {' · '}Current map has {currentRouteCount} routes, {currentAirportCount} airports
            </div>
          </div>

          <div className="space-y-2.5" role="radiogroup" aria-label="Import behavior">
            <p className="text-xs font-medium text-[var(--ink-secondary)]">
              How would you like to import these routes into Edit Mode?
            </p>

            {/* Option A: Keep current routes & merge */}
            <label
              className={`flex items-start gap-3 rounded border p-3.5 cursor-pointer transition-colors ${
                strategy === 'keep-and-merge'
                  ? 'border-amber-600 bg-amber-500/8 dark:bg-amber-500/12'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)]'
              }`}
            >
              <input
                type="radio"
                name="import-strategy"
                value="keep-and-merge"
                checked={strategy === 'keep-and-merge'}
                onChange={() => setStrategy('keep-and-merge')}
                className="mt-0.5 accent-amber-600 cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
                  <Layers className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Keep current routes and add imported ones</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                  Adds the imported routes{pending.airports ? ' and any new airports' : ''} onto
                  your current Edit Mode map without removing anything already there.
                </p>
              </div>
            </label>

            {/* Option B: Replace old routes */}
            <label
              className={`flex items-start gap-3 rounded border p-3.5 cursor-pointer transition-colors ${
                strategy === 'replace-old'
                  ? 'border-[#EE1C25] bg-red-500/6 dark:bg-red-500/12'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)]'
              }`}
            >
              <input
                type="radio"
                name="import-strategy"
                value="replace-old"
                checked={strategy === 'replace-old'}
                onChange={() => setStrategy('replace-old')}
                className="mt-0.5 accent-[#EE1C25] cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
                  <Replace className="h-3.5 w-3.5 text-[#EE1C25] shrink-0" />
                  <span>Replace old routes with imported ones</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                  {pending.airports
                    ? `Clears the ${currentRouteCount} current routes and replaces your Edit Mode map with only the imported airports and routes.`
                    : `Clears the ${currentRouteCount} current routes on the map and loads only the ${incomingRouteCount} imported routes (keeps your existing airports).`}
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-alt)] px-5 py-3">
          <span className="font-mono text-[11px] text-[var(--ink-muted)]">
            Local only · Ctrl+Z to undo
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-9 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 font-mono text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(strategy)}
              className={`h-9 rounded px-4 font-mono text-xs font-semibold text-white transition-colors ${
                strategy === 'replace-old'
                  ? 'bg-[#EE1C25] hover:bg-[#cc121a]'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {strategy === 'keep-and-merge' ? 'Import & Keep Current' : 'Replace & Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
