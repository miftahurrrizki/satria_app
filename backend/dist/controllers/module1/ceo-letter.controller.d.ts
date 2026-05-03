/**
 * CEO Letter — Surat arahan Direksi (1 dokumen per tahun) + area pengawasan.
 *
 * Endpoints:
 *   GET    /ceo-letter?tahun=YYYY      → ambil header + areas (atau null kalau belum ada)
 *   PUT    /ceo-letter                 → upsert header + replace areas (multipart bisa attach PDF)
 *   POST   /ceo-letter/:id/file        → upload/replace PDF saja
 *   DELETE /ceo-letter/:id/file        → hapus file PDF
 *   DELETE /ceo-letter/:id             → soft-delete CEO letter
 */
import { Request, Response } from 'express';
export declare function getCeoLetterAreas(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getCeoLetter(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function upsertCeoLetter(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function uploadCeoLetterFile(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteCeoLetterFile(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteCeoLetter(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=ceo-letter.controller.d.ts.map