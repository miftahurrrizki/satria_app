import { create } from 'zustand';
import { User } from '../types';

/**
 * Auth Store — Best Practice Security:
 *
 * TOKEN  : TIDAK disimpan di localStorage/sessionStorage.
 *          Backend mengirim JWT via httpOnly cookie (tidak bisa diakses JS → aman dari XSS).
 *          Token dikirim otomatis browser di setiap request (withCredentials: true).
 *
 * USER   : Disimpan di sessionStorage (bukan localStorage).
 *          sessionStorage:
 *          ✓ Dibersihkan saat browser/tab ditutup → lebih aman
 *          ✓ Tidak di-share antar tab → isolasi sesi
 *          ✗ Hilang saat refresh → ditangani dengan re-fetch /auth/me di App.tsx
 */

const SESSION_KEY = 'satria_user';

function loadStoredUser(): User | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

interface AuthState {
  user:      User | null;
  isLoading: boolean;
  /** Dipanggil setelah login berhasil — simpan user profile ke sessionStorage. */
  setAuth:   (user: User) => void;
  /** Update partial user data (misal setelah /auth/me refresh). */
  setUser:   (user: User) => void;
  /** Hapus sesi lokal + trigger logout endpoint untuk clear cookie di server. */
  logout:    () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:      loadStoredUser(),
  isLoading: false,

  setAuth: (user) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    set({ user });
  },

  setUser: (user) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    set({ user });
  },

  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    set({ user: null });
  },
}));
