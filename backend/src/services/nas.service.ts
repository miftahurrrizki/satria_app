/**
 * NAS Service — Modul 3 Auditor's Copy
 *
 * Bertanggung jawab atas semua interaksi filesystem dengan NAS SATRIA.
 *   - Base path: Z:\SATRIA (drive yang termount ke \\10.10.1.113\bank-data-spi\SATRIA)
 *
 * Konvensi:
 *   - Setiap PROGRAM kerja punya 1 folder utama langsung di bawah base.
 *     Nama folder = judul program (sanitized — karakter ilegal Windows dihapus).
 *   - File evidence disimpan di sub-path relatif dari folder program tersebut.
 *
 * Untuk file besar (10GB+), upload menggunakan stream piping lewat multer diskStorage.
 * Service ini tidak load file ke memory.
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

// ── Base path configuration ──────────────────────────────────────────────────
// NAS path TUNGGAL — tidak ada fallback dev folder.
// Kalau Z:\SATRIA (atau path yang Anda set di NAS_BASE_PATH) tidak accessible,
// healthCheck() akan return connected=false dan upload akan gagal.
// Ini sengaja: status NAS harus jujur — jangan menyembunyikan masalah jaringan.
const NAS_PATH = process.env.NAS_BASE_PATH || 'Z:\\';

/** Resolve base path — selalu pakai NAS_BASE_PATH apa adanya. */
export function getBasePath(): string {
  return NAS_PATH;
}

/** Stub agar tidak break import lain. */
export function resetBasePath(): void {
  /* no-op — base path tidak di-cache lagi */
}

// ── Filename / folder sanitization ───────────────────────────────────────────

/** Karakter ilegal Windows: \ / : * ? " < > | + control chars */
const ILLEGAL_CHARS = /[\\/:*?"<>|\x00-\x1F]/g;
/** Reserved Windows names (case insensitive). */
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

/** Sanitasi nama folder/file — buang karakter ilegal, trim spasi/titik di ujung. */
export function sanitizeName(name: string): string {
  let cleaned = name.replace(ILLEGAL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  // Hapus titik di akhir (Windows menolak)
  cleaned = cleaned.replace(/\.+$/, '').trim();
  if (!cleaned) cleaned = 'untitled';
  if (RESERVED.test(cleaned)) cleaned = `_${cleaned}`;
  // Limit panjang (Windows MAX_PATH = 260, sisakan budget untuk subpath)
  if (cleaned.length > 180) cleaned = cleaned.slice(0, 180).trim();
  return cleaned;
}

// ── Health check ─────────────────────────────────────────────────────────────

export type NasHealth = {
  connected: boolean;
  basePath: string;
  isProduction: boolean;
  message?: string;
  checkedAt: string;
};

/** Cek apakah NAS bisa diakses (read + write). */
export async function healthCheck(): Promise<NasHealth> {
  const basePath = getBasePath();
  const checkedAt = new Date().toISOString();

  try {
    await fsp.access(basePath, fs.constants.R_OK | fs.constants.W_OK);
    return { connected: true, basePath, isProduction: true, checkedAt };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = code === 'ENOENT'
      ? `Folder ${basePath} tidak ditemukan. Pastikan drive Z: termount ke NAS.`
      : code === 'EPERM' || code === 'EACCES'
      ? `Tidak ada izin akses ke ${basePath}. Pastikan kredensial NAS valid.`
      : `NAS tidak bisa diakses: ${(err as Error).message}`;
    return { connected: false, basePath, isProduction: true, message, checkedAt };
  }
}

// ── Folder operations ────────────────────────────────────────────────────────

/**
 * Template subfolder yang otomatis dibuat saat program di-init pertama kali.
 * User tetap bisa nambah folder custom di luar list ini.
 */
export const PROGRAM_TEMPLATE: readonly string[] = [
  '1. Perencanaan',
  '2. Pelaksanaan/1. Auditor Copy',
  '2. Pelaksanaan/2. Kertas Kerja Audit',
  '2. Pelaksanaan/3. Notulen',
  '2. Pelaksanaan/4. Korespondensi',
  '2. Pelaksanaan/5. Berita Acara',
  '3. Pelaporan/1. Draft Laporan',
  '3. Pelaporan/2. Laporan Final',
];

/** Default upload destination kalau user tidak pilih folder. */
export const DEFAULT_UPLOAD_SUBFOLDER = '2. Pelaksanaan/2. Kertas Kerja Audit';

/**
 * Pastikan folder program ada di NAS, lengkap dengan template subfolders.
 * Idempotent: aman dipanggil ulang. Kalau template subfolder sudah ada, di-skip.
 * @param folderName — nama folder yang sudah disanitasi
 * @returns absolute path folder program
 */
export async function ensureProgramFolder(folderName: string): Promise<string> {
  const base    = getBasePath();
  const safe    = sanitizeName(folderName);
  const fullPath = path.join(base, safe);
  await fsp.mkdir(fullPath, { recursive: true });
  // Bikin template subfolders sekali (idempotent — mkdir recursive aman dipanggil ulang)
  for (const rel of PROGRAM_TEMPLATE) {
    await ensureSubPath(safe, rel);
  }
  return fullPath;
}

/**
 * Bikin satu folder custom di dalam folder program.
 * @param programFolder — nama folder program (sudah disanitasi)
 * @param parentRelativePath — relative path parent folder (boleh kosong = root program)
 * @param name — nama folder baru (akan disanitasi)
 */
export async function createCustomFolder(
  programFolder: string,
  parentRelativePath: string,
  name: string,
): Promise<{ relativePath: string; fullPath: string }> {
  const safeName = sanitizeName(name);
  const relativePath = parentRelativePath
    ? path.posix.join(parentRelativePath.replace(/\\/g, '/'), safeName)
    : safeName;
  const fullPath = await ensureSubPath(programFolder, relativePath);
  return { relativePath, fullPath };
}

/** Cek apakah path absolut yang resolve = NAS path tertentu (dipakai untuk display). */
export function buildAbsoluteDisplay(folderName: string, relativePath: string): string {
  const base = getBasePath();
  return path.join(base, folderName, relativePath.replace(/\\/g, path.sep));
}

/** Pastikan sub-path di dalam folder program ada. */
export async function ensureSubPath(programFolder: string, relativePath: string): Promise<string> {
  const base = getBasePath();
  const programAbs = path.join(base, programFolder);
  const safeRel = relativePath
    .split(/[/\\]+/)
    .filter(Boolean)
    .map(sanitizeName)
    .join(path.sep);
  const fullPath = path.join(programAbs, safeRel);
  // Guard: pastikan tidak ada path traversal (..)
  if (!fullPath.startsWith(programAbs)) {
    throw new Error('Invalid path: traversal detected');
  }
  await fsp.mkdir(fullPath, { recursive: true });
  return fullPath;
}

// ── File operations ──────────────────────────────────────────────────────────

export type NasFileEntry = {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  relativePath: string;
};

/** List isi folder (1 level). */
export async function listFolder(programFolder: string, subPath = ''): Promise<NasFileEntry[]> {
  const base = getBasePath();
  const programAbs = path.join(base, programFolder);
  const target = path.join(programAbs, subPath);

  // Path traversal guard
  if (!target.startsWith(programAbs)) {
    throw new Error('Invalid path: traversal detected');
  }

  try {
    const entries = await fsp.readdir(target, { withFileTypes: true });
    const out: NasFileEntry[] = [];
    for (const ent of entries) {
      const entryPath = path.join(target, ent.name);
      const stat = await fsp.stat(entryPath);
      out.push({
        name: ent.name,
        isDirectory: ent.isDirectory(),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        relativePath: path.join(subPath, ent.name).replace(/\\/g, '/'),
      });
    }
    // Folder dulu, baru file
    out.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export type NasFolderNode = {
  name: string;
  relativePath: string;
  children: NasFolderNode[];
};

/** List semua folder (rekursif) di dalam folder program — untuk folder picker. */
export async function listFoldersTree(programFolder: string): Promise<NasFolderNode[]> {
  const base = getBasePath();
  const programAbs = path.join(base, programFolder);

  async function walk(dirAbs: string, dirRel: string): Promise<NasFolderNode[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dirAbs, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const out: NasFolderNode[] = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const childAbs = path.join(dirAbs, ent.name);
      const childRel = dirRel ? path.posix.join(dirRel, ent.name) : ent.name;
      out.push({
        name: ent.name,
        relativePath: childRel,
        children: await walk(childAbs, childRel),
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }
  return walk(programAbs, '');
}

/**
 * Cari nama file unik kalau sudah ada (file.pdf → file (2).pdf → file (3).pdf).
 * @returns nama file final + absolute path
 */
export async function uniqueFilePath(
  destDir: string,
  originalName: string,
): Promise<{ finalName: string; fullPath: string }> {
  const ext  = path.extname(originalName);
  const stem = path.basename(originalName, ext);
  const safeStem = sanitizeName(stem);
  let finalName = safeStem + ext;
  let fullPath  = path.join(destDir, finalName);
  let i = 2;
  while (true) {
    try {
      await fsp.access(fullPath);
      finalName = `${safeStem} (${i})${ext}`;
      fullPath  = path.join(destDir, finalName);
      i++;
    } catch {
      break;
    }
  }
  return { finalName, fullPath };
}

/** Hapus file fisik dari NAS (relatif terhadap folder program). */
export async function deleteFile(programFolder: string, relativePath: string): Promise<void> {
  const base = getBasePath();
  const programAbs = path.join(base, programFolder);
  const target = path.join(programAbs, relativePath);
  if (!target.startsWith(programAbs)) {
    throw new Error('Invalid path: traversal detected');
  }
  try {
    await fsp.unlink(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // File sudah tidak ada → silently OK
  }
}

/** Buat read stream untuk download file. */
export function createReadStream(programFolder: string, relativePath: string): fs.ReadStream {
  const base = getBasePath();
  const programAbs = path.join(base, programFolder);
  const target = path.join(programAbs, relativePath);
  if (!target.startsWith(programAbs)) {
    throw new Error('Invalid path: traversal detected');
  }
  return fs.createReadStream(target);
}

/** Cek file fisik ada di NAS. */
export async function fileExists(programFolder: string, relativePath: string): Promise<boolean> {
  const base = getBasePath();
  const target = path.join(base, programFolder, relativePath);
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}
