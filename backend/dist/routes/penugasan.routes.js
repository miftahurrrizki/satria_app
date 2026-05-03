"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const C = __importStar(require("../controllers/module2/penugasan.controller"));
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Programs
router.get('/', C.listPrograms);
router.post('/', C.createProgram);
router.get('/:id', C.getProgram);
router.patch('/:id', C.updateProgram);
router.delete('/:id', C.deleteProgram);
// Fase items
router.post('/:id/fase-items', C.createFaseItem);
router.patch('/fase-items/:itemId', C.updateFaseItem);
router.delete('/fase-items/:itemId', C.deleteFaseItem);
// Tujuan
router.post('/:id/tujuan', C.createTujuan);
router.patch('/tujuan/:tujuanId', C.updateTujuan);
router.delete('/tujuan/:tujuanId', C.deleteTujuan);
// Risiko
router.post('/tujuan/:tujuanId/risiko', C.createRisiko);
router.patch('/risiko/:risikoId', C.updateRisiko);
router.delete('/risiko/:risikoId', C.deleteRisiko);
// Prosedur
router.post('/risiko/:risikoId/prosedur', C.createProsedur);
router.patch('/prosedur/:prosedurId', C.updateProsedur);
router.delete('/prosedur/:prosedurId', C.deleteProsedur);
// Rincian
router.post('/prosedur/:prosedurId/rincian', C.createRincian);
router.patch('/rincian/:rincianId', C.updateRincian);
router.delete('/rincian/:rincianId', C.deleteRincian);
exports.default = router;
//# sourceMappingURL=penugasan.routes.js.map