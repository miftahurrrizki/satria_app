/**
 * useAutoSave — Auto-save hook dengan strategi 4-layer:
 *
 *   1. Debounce 3 detik setelah user berhenti mengetik
 *   2. Save on-blur (immediate flush)
 *   3. LocalStorage backup setiap perubahan (instan)
 *   4. State indicator untuk UI ("Tersimpan", "Menyimpan…", "Gagal", "Belum tersimpan")
 *
 * Pemakaian:
 *   const { state, lastSavedAt, saveNow, markChanged } = useAutoSave({
 *     value: localValue,
 *     onSave: (val) => api.patchSomething(id, val),
 *     storageKey: `m3-deskripsi-${id}`,
 *     debounceMs: 3000,
 *   });
 *
 *   // Saat user mengubah field:
 *   onChange={(v) => { setLocalValue(v); markChanged(v); }}
 *
 *   // Saat user blur dari editor:
 *   onBlur={() => saveNow()}
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface Options<T> {
  value: T;
  onSave: (val: T) => Promise<unknown>;
  storageKey?: string;            // Local storage backup key (optional)
  debounceMs?: number;            // Default 3000
  enabled?: boolean;              // Default true; matikan saat awal
}

interface Result<T> {
  state: AutoSaveState;
  lastSavedAt: Date | null;
  errorMsg: string | null;
  /** Trigger sebagai sinyal "isi berubah" — schedule debounced save. */
  markChanged: (val: T) => void;
  /** Save sekarang juga (mis. dipanggil di onBlur). Returns Promise. */
  saveNow: () => Promise<void>;
  /** Hapus draft di localStorage (mis. saat data sukses tersimpan & user navigate keluar). */
  clearLocalBackup: () => void;
  /** Get backup dari localStorage (mis. saat mount untuk restore). */
  loadLocalBackup: () => T | null;
}

export function useAutoSave<T>({
  value,
  onSave,
  storageKey,
  debounceMs = 3000,
  enabled = true,
}: Options<T>): Result<T> {
  const [state, setState] = useState<AutoSaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef<T>(value);
  const savingRef = useRef(false);

  // Keep latest value
  useEffect(() => { valueRef.current = value; }, [value]);

  const writeBackup = useCallback((val: T) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ value: val, at: Date.now() }));
    } catch {
      // ignore quota errors
    }
  }, [storageKey]);

  const clearLocalBackup = useCallback(() => {
    if (!storageKey) return;
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);

  const loadLocalBackup = useCallback((): T | null => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { value: T; at: number };
      return parsed.value;
    } catch {
      return null;
    }
  }, [storageKey]);

  const doSave = useCallback(async () => {
    if (!enabled) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setState('saving');
    setErrorMsg(null);
    try {
      await onSave(valueRef.current);
      setState('saved');
      setLastSavedAt(new Date());
      clearLocalBackup();
    } catch (e: any) {
      setState('error');
      setErrorMsg(e?.response?.data?.message ?? e?.message ?? 'Gagal menyimpan');
    } finally {
      savingRef.current = false;
    }
  }, [onSave, enabled, clearLocalBackup]);

  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }, [doSave]);

  const markChanged = useCallback((val: T) => {
    valueRef.current = val;
    writeBackup(val);
    setState('dirty');
    setErrorMsg(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      doSave();
    }, debounceMs);
  }, [doSave, debounceMs, enabled, writeBackup]);

  // Flush on unmount
  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      // Best-effort save sync (without await)
      doSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on tab close / page hide (best-effort)
  useEffect(() => {
    const handler = () => {
      if (state === 'dirty' && enabled) {
        // navigator.sendBeacon would be ideal, but our API is JSON PATCH — best-effort fetch
        doSave();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state, enabled, doSave]);

  return {
    state,
    lastSavedAt,
    errorMsg,
    markChanged,
    saveNow,
    clearLocalBackup,
    loadLocalBackup,
  };
}

/**
 * AutoSaveIndicator — UI kecil untuk menunjukkan status auto-save.
 * Pakai di pojok layar atau dekat field yang punya auto-save.
 */
export function autoSaveLabel(state: AutoSaveState, lastSavedAt: Date | null, errorMsg: string | null): string {
  switch (state) {
    case 'idle':   return 'Belum ada perubahan';
    case 'dirty':  return 'Perubahan belum tersimpan';
    case 'saving': return 'Menyimpan…';
    case 'saved':  return lastSavedAt ? `Tersimpan otomatis · ${formatRelativeTime(lastSavedAt)}` : 'Tersimpan otomatis';
    case 'error':  return errorMsg ? `Gagal: ${errorMsg}` : 'Gagal menyimpan';
  }
}

function formatRelativeTime(date: Date): string {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5)   return 'baru saja';
  if (diffSec < 60)  return `${diffSec} detik lalu`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
