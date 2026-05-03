/**
 * Simple in-memory TTL cache.
 * Digunakan untuk reference data yang jarang berubah (risk_level_ref, sasaran_korporat, dll).
 */
declare class TtlCache {
    private store;
    set<T>(key: string, data: T, ttlMs: number): void;
    get<T>(key: string): T | undefined;
    delete(key: string): void;
    /** Hapus semua entry dengan prefix tertentu — berguna untuk invalidasi grup. */
    deleteByPrefix(prefix: string): void;
}
export declare const cache: TtlCache;
export declare const TTL: {
    readonly ONE_MINUTE: 60000;
    readonly FIVE_MINUTES: number;
    readonly ONE_HOUR: number;
    readonly ONE_DAY: number;
};
export {};
//# sourceMappingURL=cache.d.ts.map