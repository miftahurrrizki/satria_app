/**
 * ConfirmDialog — Global confirmation modal yang menggantikan window.confirm().
 *
 * Pemakaian:
 *   1. Bungkus root app dengan <ConfirmProvider>
 *   2. Di komponen mana pun:
 *        const confirm = useConfirm();
 *        const ok = await confirm({
 *          title: 'Hapus Hasil Audit?',
 *          description: 'Tindakan ini akan menghapus permanen…',
 *          confirmLabel: 'Ya, Hapus',
 *          variant: 'danger',
 *        });
 *        if (ok) doDelete();
 *
 * Variants:
 *   - danger  : destructive (hapus, reset, force) — merah, ikon Trash2
 *   - warning : peringatan (kunci, finalize, lock) — amber, ikon AlertTriangle
 *   - info    : netral konfirmasi biasa — biru, ikon Info
 *   - success : OK / proceed — hijau, ikon CheckCircle
 *
 * Fitur:
 *   - Promise-based API (await confirm({...}))
 *   - Keyboard: Esc → cancel, Enter → confirm
 *   - Auto-focus tombol konfirmasi
 *   - Click backdrop → cancel
 *   - Body scroll lock saat terbuka
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import {
  AlertTriangle, Trash2, Info, CheckCircle2, X, Loader2, ShieldAlert,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmOptions {
  /** Judul singkat — biasanya dalam bentuk pertanyaan. */
  title: string;
  /** Deskripsi panjang — jelaskan dampak / konsekuensi. Bisa string atau ReactNode. */
  description?: ReactNode;
  /** Label tombol konfirmasi. Default tergantung variant. */
  confirmLabel?: string;
  /** Label tombol batal. Default: "Batal". */
  cancelLabel?: string;
  /** Variant warna & ikon. Default: 'info'. */
  variant?: ConfirmVariant;
  /** Tampilkan tombol konfirmasi sebagai disabled saat user perlu re-confirm. */
  requireText?: string;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (ok: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant config
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<ConfirmVariant, {
  Icon: React.ElementType;
  iconBg: string;
  iconText: string;
  confirmCls: string;
  defaultConfirmLabel: string;
}> = {
  danger: {
    Icon: Trash2,
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
    confirmCls: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-300',
    defaultConfirmLabel: 'Ya, Hapus',
  },
  warning: {
    Icon: ShieldAlert,
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
    confirmCls: 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-300',
    defaultConfirmLabel: 'Lanjutkan',
  },
  info: {
    Icon: Info,
    iconBg: 'bg-primary-100',
    iconText: 'text-primary-600',
    confirmCls: 'bg-primary-600 hover:bg-primary-700 text-white focus:ring-primary-300',
    defaultConfirmLabel: 'Ya, Lanjutkan',
  },
  success: {
    Icon: CheckCircle2,
    iconBg: 'bg-green-100',
    iconText: 'text-green-600',
    confirmCls: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-300',
    defaultConfirmLabel: 'Lanjutkan',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Provider + Dialog
// ─────────────────────────────────────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({ open: false, title: '' });
  const [requireInput, setRequireInput] = useState('');
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequireInput('');
      setState({ ...opts, open: true, resolve });
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    state.resolve?.(ok);
    setState((s) => ({ ...s, open: false }));
  }, [state]);

  // Body scroll lock + auto focus + keyboard handling
  useEffect(() => {
    if (!state.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Auto-focus confirm button
    setTimeout(() => confirmBtnRef.current?.focus(), 50);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        // Enter triggers confirm only if not typing in input
        e.preventDefault();
        if (canConfirm()) close(true);
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  const variant = state.variant ?? 'info';
  const cfg = VARIANT_CONFIG[variant];
  const Icon = cfg.Icon;

  function canConfirm() {
    if (state.requireText) return requireInput.trim() === state.requireText.trim();
    return true;
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {state.open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[100] bg-slate-900/55 backdrop-blur-sm animate-fadeIn"
            onClick={() => close(false)}
          />
          {/* Dialog */}
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden animate-slideUp"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header dengan ikon besar */}
              <div className="flex items-start gap-4 px-6 pt-6 pb-2">
                <div className={`w-12 h-12 rounded-full ${cfg.iconBg} ${cfg.iconText} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 id="confirm-title" className="text-base font-bold text-slate-800 leading-snug">
                    {state.title}
                  </h3>
                  {state.description && (
                    <div className="mt-2 text-sm text-slate-600 leading-relaxed">
                      {state.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => close(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Optional require-text input (typed confirmation) */}
              {state.requireText && (
                <div className="px-6 pb-2">
                  <p className="text-xs text-slate-500 mb-1.5">
                    Untuk melanjutkan, ketik <span className="font-mono font-bold text-slate-700">{state.requireText}</span> di bawah:
                  </p>
                  <input
                    type="text"
                    value={requireInput}
                    onChange={(e) => setRequireInput(e.target.value)}
                    autoFocus
                    className="input"
                    placeholder={state.requireText}
                  />
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={() => close(false)}
                  className="btn-secondary"
                  type="button"
                >
                  {state.cancelLabel ?? 'Batal'}
                </button>
                <button
                  ref={confirmBtnRef}
                  onClick={() => close(true)}
                  disabled={!canConfirm()}
                  type="button"
                  className={`inline-flex items-center gap-1.5 font-medium px-4 py-2 rounded-lg text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1 ${cfg.confirmCls}`}
                >
                  {state.confirmLabel ?? cfg.defaultConfirmLabel}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  );
}
