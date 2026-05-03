"use strict";
/**
 * Simple in-memory TTL cache.
 * Digunakan untuk reference data yang jarang berubah (risk_level_ref, sasaran_korporat, dll).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTL = exports.cache = void 0;
class TtlCache {
    constructor() {
        this.store = new Map();
    }
    set(key, data, ttlMs) {
        this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.data;
    }
    delete(key) {
        this.store.delete(key);
    }
    /** Hapus semua entry dengan prefix tertentu — berguna untuk invalidasi grup. */
    deleteByPrefix(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix))
                this.store.delete(key);
        }
    }
}
exports.cache = new TtlCache();
exports.TTL = {
    ONE_MINUTE: 60000,
    FIVE_MINUTES: 5 * 60000,
    ONE_HOUR: 60 * 60000,
    ONE_DAY: 24 * 60 * 60000,
};
//# sourceMappingURL=cache.js.map