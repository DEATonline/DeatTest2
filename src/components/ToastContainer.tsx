import React from 'react';
import { X } from 'lucide-react';
import { ToastMessage } from '../types/network';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-16 right-4 z-[1100] flex flex-col gap-2 max-w-sm pointer-events-none"
    >
      {toasts.map((toast) => {
        const toneClasses =
          toast.tone === 'error'
            ? 'border-red-500/60 text-[var(--err)]'
            : toast.tone === 'success'
              ? 'border-emerald-600/50 text-[var(--ok)]'
              : toast.tone === 'warning'
                ? 'border-amber-500/60 text-amber-700 dark:text-amber-400'
                : 'border-[var(--border-strong)] text-[var(--ink)]';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded border bg-[var(--surface)] px-3.5 py-2.5 text-xs font-medium shadow-md ${toneClasses}`}
          >
            <span className="leading-snug">{toast.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="text-[var(--ink-muted)] hover:text-[var(--ink)] shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
