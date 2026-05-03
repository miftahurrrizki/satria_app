import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as C from '../controllers/module2/penugasan.controller';

const router = Router();
router.use(authenticate);

// Programs
router.get('/',        C.listPrograms);
router.post('/',       C.createProgram);
router.get('/:id',     C.getProgram);
router.patch('/:id',   C.updateProgram);
router.delete('/:id',  C.deleteProgram);

// Fase items
router.post('/:id/fase-items',           C.createFaseItem);
router.patch('/fase-items/:itemId',      C.updateFaseItem);
router.delete('/fase-items/:itemId',     C.deleteFaseItem);

// Tujuan
router.post('/:id/tujuan',               C.createTujuan);
router.patch('/tujuan/:tujuanId',        C.updateTujuan);
router.delete('/tujuan/:tujuanId',       C.deleteTujuan);

// Risiko
router.post('/tujuan/:tujuanId/risiko',  C.createRisiko);
router.patch('/risiko/:risikoId',        C.updateRisiko);
router.delete('/risiko/:risikoId',       C.deleteRisiko);

// Prosedur
router.post('/risiko/:risikoId/prosedur',    C.createProsedur);
router.patch('/prosedur/:prosedurId',        C.updateProsedur);
router.delete('/prosedur/:prosedurId',       C.deleteProsedur);

// Rincian
router.post('/prosedur/:prosedurId/rincian', C.createRincian);
router.patch('/rincian/:rincianId',          C.updateRincian);
router.delete('/rincian/:rincianId',         C.deleteRincian);

export default router;
