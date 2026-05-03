"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * API Router — menggabungkan semua domain route.
 * Setiap file route mengelola satu domain/modul secara independen.
 */
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const notifications_routes_1 = __importDefault(require("./notifications.routes"));
const admin_routes_1 = __importDefault(require("./admin.routes"));
const module1_routes_1 = __importDefault(require("./module1.routes"));
const organisasi_routes_1 = __importDefault(require("./organisasi.routes"));
const settings_routes_1 = __importDefault(require("./settings.routes"));
const penugasan_routes_1 = __importDefault(require("./penugasan.routes"));
const router = (0, express_1.Router)();
// ── Auth ──────────────────────────────────────────────────────
router.use('/auth', auth_routes_1.default);
// ── Notifications ─────────────────────────────────────────────
router.use('/', notifications_routes_1.default);
// ── Admin (User Management + Activity Log) ────────────────────
router.use('/', admin_routes_1.default);
// ── Modul 1: Perencanaan Pengawasan Tahunan ───────────────────
router.use('/', module1_routes_1.default);
// ── Organisasi (Direktorat, Divisi, Departemen) ───────────────
router.use('/', organisasi_routes_1.default);
// ── Pengaturan Sistem (HoS, Sasaran, Bobot, Tipe Penugasan) ───
router.use('/', settings_routes_1.default);
// ── Modul 2: Perencanaan Pengawasan Individual ────────────────
router.use('/penugasan', penugasan_routes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map