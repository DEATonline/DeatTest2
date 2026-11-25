import React, { useEffect, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
}

export function AuthModal({ open, onClose, onSignIn }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setPassword('');
    const timer = window.setTimeout(() => emailRef.current?.focus(), 40);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSignIn(email.trim(), password);
      setPassword('');
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Authentication failed. Check email and password.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded border border-[var(--border-strong)] bg-[var(--surface)] shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-alt)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#EE1C25]" aria-hidden="true" />
            <h2
              id="auth-modal-title"
              className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
            >
              Admin Authentication
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign-in dialog"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
              Sign in with your authorized DEAT admin account to unlock the Network Editor,
              Edit Mode, and publish changes to Firebase.
            </p>

            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="block font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]"
              >
                Admin Email
              </label>
              <input
                ref={emailRef}
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@deat.aero"
                className="h-10 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[#EE1C25]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="auth-password"
                className="block font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="h-10 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[#EE1C25]"
              />
            </div>

            {error && (
              <div role="alert" className="font-mono text-xs text-[var(--err)]">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-alt)] px-5 py-3">
            <span className="font-mono text-[11px] text-[var(--ink-muted)]">
              Authorized admins only
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 rounded bg-[#EE1C25] px-4 font-mono text-xs font-semibold text-white hover:bg-[#cc121a] disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
