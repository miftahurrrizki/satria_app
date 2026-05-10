/**
 * Modul 3 — Access Control Middleware
 *
 * Aturan akses:
 *   - kepala_spi & admin_spi  → semua program (full access)
 *   - role lain               → hanya program yg user-nya ada di pkpt.annual_plan_team
 *
 * Pola pemakaian:
 *   1) `requireProgramAccess('id')` — guard endpoint yg menerima :programId di params
 *   2) `requireProsedurAccess('prosedurId')` — resolve prosedur → program → akses
 *   3) `requireRincianAccess('rincianId')` — resolve rincian → prosedur → program → akses
 *   4) `requireEvidenceAccess('evidenceId')` — resolve evidence → program → akses
 *
 * Setelah guard sukses, `req.programId` dan `req.canFullAccess` ter-set untuk dipakai controller.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { query } from '../config/database';

const FULL_ACCESS_ROLES = ['kepala_spi', 'admin_spi'];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      programId?: string;
      canFullAccess?: boolean;
    }
  }
}

export function isFullAccess(req: Request): boolean {
  return FULL_ACCESS_ROLES.includes(req.user?.role ?? '');
}

/** Cek apakah user adalah anggota tim program (via pkpt.annual_plan_team). */
async function isTeamMember(userId: string, programId: string): Promise<boolean> {
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM penugasan.audit_programs ap
       JOIN pkpt.annual_plan_team apt ON apt.annual_plan_id = ap.annual_plan_id
       WHERE ap.id = $1 AND apt.user_id = $2
     ) AS exists`,
    [programId, userId],
  );
  return Boolean(r.rows[0]?.exists);
}

/** Resolve programId dari source berbeda (prosedur, rincian, evidence). */
async function resolveProgramId(
  source: 'program' | 'prosedur' | 'rincian' | 'evidence',
  id: string,
): Promise<string | null> {
  let sql: string;
  switch (source) {
    case 'program':
      return id;
    case 'prosedur':
      sql = `SELECT tu.program_id
             FROM penugasan.prosedur pr
             JOIN penugasan.risiko ri ON ri.id = pr.risiko_id
             JOIN penugasan.tujuan tu ON tu.id = ri.tujuan_id
             WHERE pr.id = $1`;
      break;
    case 'rincian':
      sql = `SELECT tu.program_id
             FROM penugasan.rincian r
             JOIN penugasan.prosedur pr ON pr.id = r.prosedur_id
             JOIN penugasan.risiko ri   ON ri.id = pr.risiko_id
             JOIN penugasan.tujuan tu   ON tu.id = ri.tujuan_id
             WHERE r.id = $1`;
      break;
    case 'evidence':
      sql = `SELECT program_id FROM audit.workpaper_evidence WHERE id = $1`;
      break;
  }
  const r = await query<{ program_id: string }>(sql, [id]);
  return r.rows[0]?.program_id ?? null;
}

function makeGuard(
  source: 'program' | 'prosedur' | 'rincian' | 'evidence',
  paramName: string,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params[paramName];
      if (!id) {
        return res.status(400).json({ success: false, message: `Parameter ${paramName} wajib.` });
      }
      const programId = await resolveProgramId(source, id);
      if (!programId) {
        return res.status(404).json({ success: false, message: 'Resource tidak ditemukan.' });
      }
      req.programId = programId;
      req.canFullAccess = isFullAccess(req);

      if (req.canFullAccess) return next();

      const member = await isTeamMember(req.user!.id, programId);
      if (!member) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak. Anda bukan anggota tim audit pada program ini.',
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireProgramAccess  = (param = 'programId')  => makeGuard('program', param);
export const requireProsedurAccess = (param = 'prosedurId') => makeGuard('prosedur', param);
export const requireRincianAccess  = (param = 'rincianId')  => makeGuard('rincian', param);
export const requireEvidenceAccess = (param = 'evidenceId') => makeGuard('evidence', param);
