"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const organisasi_controller_1 = require("../controllers/organisasi.controller");
const router = (0, express_1.Router)();
const adminOnly = (0, auth_middleware_1.requireRole)('admin_spi', 'it_admin');
// ── Dropdown endpoints (simple list, no pagination) ──────────
router.get('/dropdown/direktorat', auth_middleware_1.authenticate, organisasi_controller_1.getDirektoratsDropdown);
router.get('/dropdown/divisi', auth_middleware_1.authenticate, organisasi_controller_1.getDivisDropdown);
router.get('/dropdown/departemen', auth_middleware_1.authenticate, organisasi_controller_1.getDepartemensDropdown);
router.get('/dropdown/sasaran-korporat', auth_middleware_1.authenticate, organisasi_controller_1.getSasaranKorporatDropdown);
// ── Direktorat (Management with pagination) ─────────────────
router.get('/direktorat', auth_middleware_1.authenticate, organisasi_controller_1.getDirektorats);
router.get('/direktorat/:id', auth_middleware_1.authenticate, organisasi_controller_1.getDirektoratById);
router.post('/direktorat', auth_middleware_1.authenticate, adminOnly, organisasi_controller_1.createDirektorat);
router.patch('/direktorat/:id', auth_middleware_1.authenticate, adminOnly, organisasi_controller_1.updateDirektorat);
// ── Divisi ────────────────────────────────────────────────────
router.get('/divisi', auth_middleware_1.authenticate, organisasi_controller_1.getDivisis);
router.get('/divisi/:id', auth_middleware_1.authenticate, organisasi_controller_1.getDivisiById);
router.post('/divisi', auth_middleware_1.authenticate, adminOnly, organisasi_controller_1.createDivisi);
router.patch('/divisi/:id', auth_middleware_1.authenticate, adminOnly, organisasi_controller_1.updateDivisi);
// ── Departemen ────────────────────────────────────────────────
router.get('/departemen', auth_middleware_1.authenticate, organisasi_controller_1.getDepartemens);
router.get('/departemen/:id', auth_middleware_1.authenticate, organisasi_controller_1.getDepartemenById);
router.post('/departemen', auth_middleware_1.authenticate, adminOnly, organisasi_controller_1.createDepartemen);
router.patch('/departemen/:id', auth_middleware_1.authenticate, adminOnly, organisasi_controller_1.updateDepartemen);
exports.default = router;
//# sourceMappingURL=organisasi.routes.js.map