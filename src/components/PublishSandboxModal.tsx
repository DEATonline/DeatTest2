import React, { useEffect, useState } from 'react';
import { CloudUpload, ExternalLink, GitMerge, ReplaceAll, X } from 'lucide-react';
import { Airport, NetworkDiffSummary, RouteSector } from '../types/network';
import { formatCityName } from '../utils/networkUtils';

export type PublishStrategy = 'overwrite-all' | 'add-new-only';

interface PublishSandboxModalProps {
  open: boolean;
  firebaseReady: boolean;
  diff: NetworkDiffSummary;
  liveAirportCount: number;
  liveRouteCount: number;
  addOnlyAirports: Airport[];
  addOnlyRoutes: RouteSector[];
  publishing: boolean;
  onConfirmPublish: (strategy: PublishStrategy) => Promise<void>;
  onOpenInEditor: () => void;
  onClose: () => void;
}

export function PublishSandboxModal({
  open,
  firebaseReady,
  diff,
  liveAirportCount,
  liveRouteCount,
  addOnlyAirports,
  addOnlyRoutes,
  publishing,
  onConfirmPublish,
  onOpenInEditor,
  onClose,
}: PublishSandboxModalProps) {
  const [strategy, setStrategy] = useState<PublishStrategy>('overwrite-all');

  useEffect(() => {
    if (!open) return;
    // Default smartly: if there are removals/edits, still let admin see both clearly;
    // if only new items exist, add-new-only is especially clear & safe.
    const onlyAdditions =
      diff.airportsRemoved.length === 0 &&
      diff.airportsModified.length === 0 &&
      diff.routesRemoved.length === 0 &&
      diff.routesModified.length === 0;
    setStrategy(onlyAdditions ? 'add-new-only' : 'overwrite-all');

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !publishing) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, publishing, onClose, diff]);

  if (!open) return null;

  const addOnlyTotal = addOnlyAirports.length + addOnlyRoutes.length;
  const canConfirm =
    !publishing &&
    (strategy === 'overwrite-all' ? diff.totalChanges > 0 : addOnlyTotal > 0);

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4"
      onClick={() => {
        if (!publishing) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-edit-mode-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded border border-[var(--border-strong)] bg-[var(--surface)] shadow-xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-alt)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <CloudUpload className="h-4 w-4 text-[#EE1C25]" aria-hidden="true" />
            <h2
              id="publish-edit-mode-title"
              className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
            >
              {firebaseReady ? 'Publish Edit Mode to Live Map' : 'Apply Edit Mode to Local Preview'}
            </h2>
          </div>
          <button
            type="button"
            disabled={publishing}
            onClick={onClose}
            aria-label="Close publish review"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Publish Strategy Choice Cards */}
          <div className="space-y-2.5" role="radiogroup" aria-label="Publish method">
            <p className="text-xs font-medium text-[var(--ink-secondary)]">
              Choose how your Edit Mode changes should be published to the live map:
            </p>

            {/* Option A: Overwrite Live Map */}
            <label
              className={`flex items-start gap-3 rounded border p-3.5 cursor-pointer transition-colors ${
                strategy === 'overwrite-all'
                  ? 'border-[#EE1C25] bg-red-500/6 dark:bg-red-500/12'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)]'
              }`}
            >
              <input
                type="radio"
                name="publish-strategy"
                value="overwrite-all"
                checked={strategy === 'overwrite-all'}
                onChange={() => setStrategy('overwrite-all')}
                className="mt-0.5 accent-[#EE1C25] cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
                  <ReplaceAll className="h-3.5 w-3.5 text-[#EE1C25] shrink-0" />
                  <span>Overwrite live map with current Edit Mode state</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                  Replaces the entire live database with what you see in Edit Mode right now—including
                  all additions, edits, and deletions.
                </p>
              </div>
            </label>

            {/* Option B: Add New Routes/Airports & Keep All Old */}
            <label
              className={`flex items-start gap-3 rounded border p-3.5 cursor-pointer transition-colors ${
                strategy === 'add-new-only'
                  ? 'border-emerald-600 bg-emerald-500/8 dark:bg-emerald-500/12'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)]'
              }`}
            >
              <input
                type="radio"
                name="publish-strategy"
                value="add-new-only"
                checked={strategy === 'add-new-only'}
                onChange={() => setStrategy('add-new-only')}
                className="mt-0.5 accent-emerald-600 cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
                  <GitMerge className="h-3.5 w-3.5 text-[var(--ok)] shrink-0" />
                  <span>Add new routes &amp; airports only (keep all existing live routes)</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                  Appends only your newly created airports and routes to the live map. All{' '}
                  <strong className="text-[var(--ink-secondary)]">
                    {liveRouteCount} existing live routes
                  </strong>{' '}
                  and{' '}
                  <strong className="text-[var(--ink-secondary)]">
                    {liveAirportCount} airports
                  </strong>{' '}
                  stay untouched.
                </p>
              </div>
            </label>
          </div>

          {/* Dynamic Preview based on selected strategy */}
          {strategy === 'overwrite-all' ? (
            <>
              <div className="grid grid-cols-2 border-t border-l border-[var(--border)] rounded overflow-hidden">
                <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-3.5 py-2.5">
                  <div className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
                    Airports &amp; Hubs
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2.5 font-mono text-xs font-semibold tabular-nums">
                    <span className="text-[var(--ok)]">+{diff.airportsAdded.length} added</span>
                    <span className="text-amber-600 dark:text-amber-400">
                      ~{diff.airportsModified.length} edited
                    </span>
                    <span className="text-[var(--err)]">
                      −{diff.airportsRemoved.length} removed
                    </span>
                  </div>
                </div>

                <div className="border-r border-b border-[var(--border)] bg-[var(--surface-alt)] px-3.5 py-2.5">
                  <div className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
                    Flight Sectors
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2.5 font-mono text-xs font-semibold tabular-nums">
                    <span className="text-[var(--ok)]">+{diff.routesAdded.length} added</span>
                    <span className="text-amber-600 dark:text-amber-400">
                      ~{diff.routesModified.length} edited
                    </span>
                    <span className="text-[var(--err)]">
                      −{diff.routesRemoved.length} removed
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded border border-[var(--border)] divide-y divide-[var(--border)] max-h-52 overflow-y-auto font-mono text-xs">
                {diff.airportsAdded.map((a) => (
                  <div
                    key={`ap-add-${a.icao}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-[var(--ok)] font-semibold">
                      + Airport · {formatCityName(a.city)} ({a.icao})
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      {a.isHub ? 'Hub' : 'Station'} · {a.continent}
                    </span>
                  </div>
                ))}
                {diff.airportsModified.map((a) => (
                  <div
                    key={`ap-mod-${a.icao}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">
                      ~ Airport · {formatCityName(a.city)} ({a.icao})
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      {a.active === false ? 'Inactive' : 'Active'} · {a.isHub ? 'Hub' : 'Station'}
                    </span>
                  </div>
                ))}
                {diff.airportsRemoved.map((a) => (
                  <div
                    key={`ap-rem-${a.icao}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-[var(--err)] font-semibold">
                      − Airport · {formatCityName(a.city)} ({a.icao})
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)]">Will be deleted</span>
                  </div>
                ))}

                {diff.routesAdded.map((r, i) => (
                  <div
                    key={`rt-add-${r.origin}-${r.dest}-${i}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-[var(--ok)] font-semibold">
                      + Sector · {r.origin} → {r.dest}
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)] truncate max-w-[180px]">
                      {r.type} · {r.aircraftTypes.join(', ')}
                    </span>
                  </div>
                ))}
                {diff.routesModified.map((r, i) => (
                  <div
                    key={`rt-mod-${r.origin}-${r.dest}-${i}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">
                      ~ Sector · {r.origin} → {r.dest}
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)] truncate max-w-[180px]">
                      {r.type} · {r.aircraftTypes.join(', ')}
                    </span>
                  </div>
                ))}
                {diff.routesRemoved.map((r, i) => (
                  <div
                    key={`rt-rem-${r.origin}-${r.dest}-${i}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-[var(--err)] font-semibold">
                      − Sector · {r.origin} → {r.dest}
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)]">Will be deleted</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded border border-emerald-600/40 bg-emerald-500/6 px-3.5 py-2.5 font-mono text-xs text-[var(--ink)] tabular-nums">
                Will add{' '}
                <strong className="text-[var(--ok)]">
                  +{addOnlyAirports.length}{' '}
                  {addOnlyAirports.length === 1 ? 'airport' : 'airports'}
                </strong>{' '}
                and{' '}
                <strong className="text-[var(--ok)]">
                  +{addOnlyRoutes.length} {addOnlyRoutes.length === 1 ? 'route' : 'routes'}
                </strong>{' '}
                while keeping all {liveRouteCount} existing live routes intact.
              </div>

              {addOnlyTotal === 0 ? (
                <div className="rounded border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-5 text-center text-xs text-[var(--ink-muted)]">
                  No brand-new airports or routes to append. To publish edits or deletions of
                  existing items, select <strong>Overwrite live map</strong> above.
                </div>
              ) : (
                <div className="rounded border border-[var(--border)] divide-y divide-[var(--border)] max-h-52 overflow-y-auto font-mono text-xs">
                  {addOnlyAirports.map((a) => (
                    <div
                      key={`ao-ap-${a.icao}`}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <span className="text-[var(--ok)] font-semibold">
                        + Airport · {formatCityName(a.city)} ({a.icao})
                      </span>
                      <span className="text-[11px] text-[var(--ink-muted)]">
                        {a.isHub ? 'Hub' : 'Station'} · {a.continent}
                      </span>
                    </div>
                  ))}
                  {addOnlyRoutes.map((r, i) => (
                    <div
                      key={`ao-rt-${r.origin}-${r.dest}-${i}`}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <span className="text-[var(--ok)] font-semibold">
                        + Sector · {r.origin} → {r.dest}
                      </span>
                      <span className="text-[11px] text-[var(--ink-muted)] truncate max-w-[180px]">
                        {r.type} · {r.aircraftTypes.join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-alt)] px-5 py-3">
          <button
            type="button"
            disabled={publishing}
            onClick={onOpenInEditor}
            className="inline-flex h-9 items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 font-mono text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open in Network Editor</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={publishing}
              onClick={onClose}
              className="h-9 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 font-mono text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() => onConfirmPublish(strategy)}
              className={`h-9 rounded px-4 font-mono text-xs font-semibold text-white disabled:opacity-45 transition-colors ${
                strategy === 'add-new-only'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[#EE1C25] hover:bg-[#cc121a]'
              }`}
            >
              {publishing
                ? 'Publishing...'
                : strategy === 'add-new-only'
                  ? firebaseReady
                    ? `Add ${addOnlyTotal} New to Live`
                    : `Apply ${addOnlyTotal} New`
                  : firebaseReady
                    ? 'Overwrite Live Map'
                    : 'Overwrite Preview'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
