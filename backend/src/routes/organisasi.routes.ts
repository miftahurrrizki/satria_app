import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import {
  getDirektorats, getDirektoratById, createDirektorat, updateDirektorat,
  getDivisis, getDivisiById, createDivisi, updateDivisi,
  getDepartemens, getDepartemenById, createDepartemen, updateDepartemen,
  getDirektoratsDropdown, getDivisDropdown, getDepartemensDropdown, getSasaranKorporatDropdown,
} from '../controllers/organisasi.controller';

const router = Router();
const adminOnly = requireRole('kepala_spi', 'admin_spi', 'it_admin');

// ── Dropdown endpoints (simple list, no pagination) ──────────
router.get('/dropdown/direktorat',       authenticate, getDirektoratsDropdown);
router.get('/dropdown/divisi',           authenticate, getDivisDropdown);
router.get('/dropdown/departemen',       authenticate, getDepartemensDropdown);
router.get('/dropdown/sasaran-korporat', authenticate, getSasaranKorporatDropdown);

// ── Direktorat (Management with pagination) ─────────────────
router.get   ('/direktorat',     authenticate, getDirektorats);
router.get   ('/direktorat/:id', authenticate, getDirektoratById);
router.post  ('/direktorat',     authenticate, adminOnly, createDirektorat);
router.patch ('/direktorat/:id', authenticate, adminOnly, updateDirektorat);

// ── Divisi ────────────────────────────────────────────────────
router.get   ('/divisi',     authenticate, getDivisis);
router.get   ('/divisi/:id', authenticate, getDivisiById);
router.post  ('/divisi',     authenticate, adminOnly, createDivisi);
router.patch ('/divisi/:id', authenticate, adminOnly, updateDivisi);

// ── Departemen ────────────────────────────────────────────────
router.get   ('/departemen',     authenticate, getDepartemens);
router.get   ('/departemen/:id', authenticate, getDepartemenById);
router.post  ('/departemen',     authenticate, adminOnly, createDepartemen);
router.patch ('/departemen/:id', authenticate, adminOnly, updateDepartemen);

export default router;
