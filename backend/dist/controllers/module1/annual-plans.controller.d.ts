import { Request, Response } from 'express';
export declare function getAnnualPlans(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getAnnualPlanById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createAnnualPlan(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateAnnualPlan(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteAnnualPlan(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getDeletedPlans(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function restoreAnnualPlan(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function purgeAnnualPlan(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function purgeAllDeletedPlans(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function finalizeAnnualPlan(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function markPlanCompleted(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function markPlanOnProgress(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function runDeadlineScan(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getDashboardStats(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=annual-plans.controller.d.ts.map