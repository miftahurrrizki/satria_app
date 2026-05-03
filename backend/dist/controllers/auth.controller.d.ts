import { Request, Response } from 'express';
export declare function login(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function me(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function logout(_req: Request, res: Response): Response<any, Record<string, any>>;
export declare function changePassword(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function resetToDefault(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=auth.controller.d.ts.map