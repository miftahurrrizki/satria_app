import { Request, Response } from 'express';
export declare function getRisks(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getTopRisks(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getRiskById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createRisk(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateRisk(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteRisk(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function importRisks(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getRiskLevelRef(_req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getSasaranKorporat(_req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getRiskStats(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function resetRisks(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function downloadRiskTemplate(_req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=risk.controller.d.ts.map