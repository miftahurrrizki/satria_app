/**
 * Module 2 — Perencanaan Pengawasan Individual
 * Controller for audit programs, fase items, tujuan, risiko, prosedur, rincian.
 *
 * Access control:
 *   kepala_spi | admin_spi → all programs
 *   others                 → only programs where req.user.id ∈ annual_plan_team
 */
import { Request, Response } from 'express';
export declare function listPrograms(req: Request, res: Response): Promise<void>;
export declare function createProgram(req: Request, res: Response): Promise<void>;
export declare function getProgram(req: Request, res: Response): Promise<void>;
export declare function updateProgram(req: Request, res: Response): Promise<void>;
export declare function deleteProgram(req: Request, res: Response): Promise<void>;
export declare function createFaseItem(req: Request, res: Response): Promise<void>;
export declare function updateFaseItem(req: Request, res: Response): Promise<void>;
export declare function deleteFaseItem(req: Request, res: Response): Promise<void>;
export declare function createTujuan(req: Request, res: Response): Promise<void>;
export declare function updateTujuan(req: Request, res: Response): Promise<void>;
export declare function deleteTujuan(req: Request, res: Response): Promise<void>;
export declare function createRisiko(req: Request, res: Response): Promise<void>;
export declare function updateRisiko(req: Request, res: Response): Promise<void>;
export declare function deleteRisiko(req: Request, res: Response): Promise<void>;
export declare function createProsedur(req: Request, res: Response): Promise<void>;
export declare function updateProsedur(req: Request, res: Response): Promise<void>;
export declare function deleteProsedur(req: Request, res: Response): Promise<void>;
export declare function createRincian(req: Request, res: Response): Promise<void>;
export declare function updateRincian(req: Request, res: Response): Promise<void>;
export declare function deleteRincian(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=penugasan.controller.d.ts.map