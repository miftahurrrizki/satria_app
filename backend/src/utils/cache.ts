/**
 * Simple in-memory TTL cache.
 * Digunakan untuk reference data yang jarang berubah (risk_level_ref, sasaran_korporat, dll).
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Hapus semua entry dengan prefix tertentu — berguna untuk invalidasi grup. */
  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

export const cache = new TtlCache();

export const TTL = {
  ONE_MINUTE:  60_000,
  FIVE_MINUTES: 5 * 60_000,
  ONE_HOUR:    60 * 60_000,
  ONE_DAY:     24 * 60 * 60_000,
} as const;
