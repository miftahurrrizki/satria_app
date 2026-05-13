/**
 * LampiranSection — Manajemen lampiran (file & link) per kegiatan.
 *
 * - List lampiran (file dan link) sebagai card
 * - Modal "Tambah Lampiran" dengan 2 tab: File / Link
 * - Hapus lampiran (soft delete + hapus file fisik di NAS)
 */
import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Paperclip, Plus, X, Upload, Link as LinkIcon, Trash2, ExternalLink,
  Loader2, FileText, Save, Download, Folder, FolderPlus, ChevronRight, ChevronDown, Check, Eye, Copy,
} from 'lucide-react';
import { module3Api, NasFolderNode } from '../../../services/api';
import { KegiatanLampiran } from '../../../types';
import { useConfirm } from '../../../components/shared/ConfirmDialog';
import { fmtBytes, fmtDate, fileIcon } from './helpers';

type ParentType = 'fase_item' | 'rincian';

interface Props {
  parentType: ParentType;
  parentId: string;
  programId: string;
  nasFolderName?: string;
  lampiran: KegiatanLampiran[];
  onChanged: () => void;
}

export default function LampiranSection({
  parentType, parentId, programId, nasFolderName, lampiran, onChanged,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const confirm = useConfirm();

  const deleteMut = useMutation({
    mutationFn: (lampiranId: string) => module3Api.deleteLampiran(lampiranId),
    onSuccess: () => {
      toast.success('Lampiran berhasil dihapus');
      onChanged();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Gagal menghapus'),
  });

  const askDelete = async (l: KegiatanLampiran) => {
    const isFile = l.tipe === 'file';
    const ok = await confirm({
      variant: 'danger',
      title: isFile ? 'Hapus File Lampiran?' : 'Hapus Tautan?',
      description: (
        <>
          {isFile ? 'File ' : 'Tautan '}
          <b className="text-slate-800">"{l.nama}"</b>{' '}
          {isFile
            ? <>akan dihapus <b>permanen</b> dari sistem dan storage. File yang sudah didownload sebelumnya tidak terpengaruh.</>
            : <>akan dihapus dari daftar lampiran. URL aslinya tetap aktif di sumber asalnya.</>}
          <br />
          <span className="text-red-600 font-medium">Tindakan ini tidak bisa dibatalkan.</span>
        </>
      ),
      confirmLabel: 'Ya, Hapus',
    });
    if (ok) deleteMut.mutate(l.id);
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Paperclip className="w-4 h-4 text-primary-600" />
          Lampiran
          {lampiran.length > 0 && (
            <span className="ml-1 text-xs font-normal text-slate-500">({lampiran.length})</span>
          )}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="btn-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Tambah
        </button>
      </div>

      {lampiran.length === 0 ? (
        <div className="text-center py-8 text-xs text-slate-400">
          <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Belum ada lampiran.</p>
          <p className="mt-1">Klik <b>Tambah</b> untuk upload file atau kirim link.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lampiran.map((l) => (
            <LampiranCard
              key={l.id}
              lampiran={l}
              nasFolderName={nasFolderName}
              onDelete={() => askDelete(l)}
              isDeleting={deleteMut.isPending && deleteMut.variables === l.id}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddLampiranModal
          parentType={parentType}
          parentId={parentId}
          programId={programId}
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); onChanged(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lampiran Card (1 item)
// ─────────────────────────────────────────────────────────────────────────────

const LINK_SOURCE_LABEL: Record<string, string> = {
  google_drive: 'Google Drive',
  onedrive:     'OneDrive',
  sharepoint:   'SharePoint',
  dropbox:      'Dropbox',
  other:        'Tautan',
};

const NAS_UNC_BASE = '\\\\10.10.1.113\\bank-data-spi\\SATRIA';

function buildNasPaths(nasFolderName: string | undefined, filePath: string | null) {
  if (!nasFolderName || !filePath) return null;
  const relParts = filePath.split('/');
  // Path relatif: subfolder\filename (buang filename, ambil folder + file)
  const relDisplay = relParts.join('\\');
  // Full UNC path untuk copy & tooltip
  const fullPath = `${NAS_UNC_BASE}\\${nasFolderName}\\${relDisplay}`;
  // Label pendek: tampilkan dari subfolder (buang program folder name)
  const shortLabel = relDisplay;
  return { fullPath, shortLabel };
}

function LampiranCard({
  lampiran, nasFolderName, onDelete, isDeleting,
}: { lampiran: KegiatanLampiran; nasFolderName?: string; onDelete: () => void; isDeleting: boolean }) {
  if (lampiran.tipe === 'link') {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-slate-50 transition-colors">
        <span className="text-lg shrink-0">🔗</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{lampiran.nama}</p>
          <p className="text-xs text-slate-500 truncate">{lampiran.url}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {LINK_SOURCE_LABEL[lampiran.link_source ?? 'other']} · {fmtDate(lampiran.created_at)}
            {lampiran.uploaded_by_nama && ` · ${lampiran.uploaded_by_nama}`}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <a href={lampiran.url ?? '#'} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-md text-slate-500 hover:bg-primary-100 hover:text-primary-700 transition-colors"
            title="Buka tautan">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={onDelete} disabled={isDeleting}
            className="p-1.5 rounded-md text-slate-500 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
            title="Hapus">
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  // tipe === 'file'
  const nasPaths = buildNasPaths(nasFolderName, lampiran.file_path);
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-slate-50 transition-colors">
      <span className="text-lg shrink-0">{fileIcon(lampiran.nama_asli ?? lampiran.nama, lampiran.mime_type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{lampiran.nama}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {fmtBytes(lampiran.ukuran_byte ?? 0)} · {fmtDate(lampiran.created_at)}
          {lampiran.uploaded_by_nama && ` · ${lampiran.uploaded_by_nama}`}
        </p>
        {nasPaths && (
          <div className="flex items-center gap-1 mt-1.5 group/path">
            <Folder className="w-3 h-3 text-slate-300 shrink-0" />
            <p
              className="text-[10px] font-mono text-slate-400 truncate"
              title={nasPaths.fullPath}
            >
              {nasPaths.shortLabel}
            </p>
            <button
              onClick={() => { navigator.clipboard.writeText(nasPaths.fullPath); toast.success('Path tersalin'); }}
              className="shrink-0 p-0.5 rounded text-slate-300 hover:text-primary-600 hover:bg-primary-50 transition-colors opacity-0 group-hover/path:opacity-100"
              title={`Salin path lengkap:\n${nasPaths.fullPath}`}
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <a href={module3Api.viewLampiranUrl(lampiran.id)} target="_blank" rel="noopener noreferrer"
          className="p-1.5 rounded-md text-slate-500 hover:bg-primary-100 hover:text-primary-700 transition-colors"
          title="Lihat / Preview">
          <Eye className="w-3.5 h-3.5" />
        </a>
        <a href={module3Api.downloadLampiranUrl(lampiran.id)} target="_blank" rel="noopener noreferrer"
          className="p-1.5 rounded-md text-slate-500 hover:bg-primary-100 hover:text-primary-700 transition-colors"
          title="Download">
          <Download className="w-3.5 h-3.5" />
        </a>
        <button onClick={onDelete} disabled={isDeleting}
          className="p-1.5 rounded-md text-slate-500 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
          title="Hapus">
          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Lampiran Modal (tab File / tab Link)
// ─────────────────────────────────────────────────────────────────────────────

function AddLampiranModal({
  parentType, parentId, programId, onClose, onSuccess,
}: {
  parentType: ParentType;
  parentId: string;
  programId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<'file' | 'link'>('file');

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary-100 text-primary-600">
                <Paperclip className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Tambah Lampiran</h3>
                <p className="text-xs text-slate-400 mt-0.5">Upload satu atau banyak file, atau kirim link tautan</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 px-5 pt-3 border-b border-slate-100">
            <button onClick={() => setTab('file')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'file' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <Upload className="w-4 h-4" /> File
            </button>
            <button onClick={() => setTab('link')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'link' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <LinkIcon className="w-4 h-4" /> Link
            </button>
          </div>

          {/* Tab content */}
          <div className="p-5">
            {tab === 'file'
              ? <UploadFileForm parentType={parentType} parentId={parentId} programId={programId} onSuccess={onSuccess} onClose={onClose} />
              : <CreateLinkForm parentType={parentType} parentId={parentId} onSuccess={onSuccess} onClose={onClose} />
            }
          </div>
        </div>
      </div>
    </>
  );
}

const DEFAULT_SUBFOLDER = '';

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';
type FileItem = { id: string; file: File; status: FileStatus; savedPath?: string; error?: string };

function UploadFileForm({
  parentType, parentId, programId, onSuccess, onClose,
}: {
  parentType: ParentType;
  parentId: string;
  programId: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [subfolder, setSubfolder] = useState<string>(DEFAULT_SUBFOLDER);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const foldersQ = useQuery({
    queryKey: ['nas-folders', programId],
    queryFn: () => module3Api.listNasFolders(programId).then((r) => r.data.data),
  });

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newItems: FileItem[] = Array.from(fileList).map((f) => ({
      id: `${f.name}-${f.size}-${Math.random()}`,
      file: f,
      status: 'pending',
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function removeFile(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function startUpload() {
    if (!items.length || uploading) return;
    if (!subfolder) {
      toast.error('Pilih folder tujuan terlebih dahulu');
      return;
    }
    setUploading(true);

    const updated = [...items];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === 'done') continue;
      updated[i] = { ...updated[i], status: 'uploading' };
      setItems([...updated]);
      try {
        const opts = { subfolder };
        const res = await (parentType === 'fase_item'
          ? module3Api.uploadFaseItemFile(parentId, updated[i].file, opts)
          : module3Api.uploadRincianFile(parentId, updated[i].file, opts));
        const abs = (res.data.data as any)?.nas_absolute_path as string | undefined;
        updated[i] = { ...updated[i], status: 'done', savedPath: abs };
      } catch (e: any) {
        const code = e?.response?.data?.code;
        const msg = code === 'NAS_UNAVAILABLE'
          ? 'NAS tidak tersambung'
          : (e?.response?.data?.message ?? 'Gagal upload');
        updated[i] = { ...updated[i], status: 'error', error: msg };
      }
      setItems([...updated]);
    }

    setUploading(false);
    const hasError = updated.some((i) => i.status === 'error');
    if (!hasError) setAllDone(true);
    else toast.error('Beberapa file gagal diupload');
  }

  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  if (allDone) {
    const savedPaths = items.map((i) => i.savedPath).filter(Boolean) as string[];
    const folderPath = savedPaths[0]
      ? savedPaths[0].substring(0, savedPaths[0].lastIndexOf('\\') + 1) || savedPaths[0]
      : '';
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emerald-900">
              {items.length} file berhasil diupload!
            </p>
            {folderPath && (
              <>
                <p className="text-xs text-emerald-700 mt-1">Tersimpan di folder NAS:</p>
                <div className="mt-1.5 px-2.5 py-2 rounded-md bg-white border border-emerald-200 font-mono text-[11px] text-slate-700 break-all">
                  {folderPath}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(folderPath); toast.success('Path tersalin'); }}
                  className="mt-1.5 text-xs text-emerald-700 hover:text-emerald-900 font-medium hover:underline"
                >
                  Salin path folder
                </button>
              </>
            )}
            {savedPaths.length > 1 && (
              <div className="mt-2 space-y-1">
                {items.map((item) => item.savedPath && (
                  <div key={item.id} className="text-[11px] font-mono text-slate-600 truncate">
                    • {item.file.name} → {item.savedPath.split('\\').slice(-2).join('\\')}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={onSuccess} className="btn-primary">Selesai</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
          uploading ? 'opacity-50 cursor-not-allowed border-slate-200' : 'cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 border-slate-300'
        }`}
      >
        <Upload className="w-7 h-7 mx-auto text-slate-400 mb-2" />
        <p className="text-sm text-slate-600 font-medium">Klik atau drag & drop file</p>
        <p className="text-xs text-slate-400 mt-0.5">PDF, DOC, XLS, gambar, atau format lain — bisa pilih banyak</p>
        <input ref={inputRef} type="file" hidden multiple
          onChange={(e) => addFiles(e.target.files)} />
      </div>

      {/* File list */}
      {items.length > 0 && (
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {items.map((item) => (
            <div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
              item.status === 'done'     ? 'border-emerald-200 bg-emerald-50' :
              item.status === 'error'    ? 'border-red-200 bg-red-50' :
              item.status === 'uploading'? 'border-primary-200 bg-primary-50' :
                                           'border-slate-200 bg-white'
            }`}>
              <span className="shrink-0">
                {item.status === 'done'      ? <Check className="w-3.5 h-3.5 text-emerald-600" /> :
                 item.status === 'error'     ? <X className="w-3.5 h-3.5 text-red-500" /> :
                 item.status === 'uploading' ? <Loader2 className="w-3.5 h-3.5 text-primary-600 animate-spin" /> :
                                               <FileText className="w-3.5 h-3.5 text-slate-400" />}
              </span>
              <span className="flex-1 truncate text-slate-700">{item.file.name}</span>
              <span className="text-slate-400 shrink-0">{fmtBytes(item.file.size)}</span>
              {item.status === 'error' && (
                <span className="text-red-500 shrink-0">{item.error}</span>
              )}
              {item.status === 'pending' && !uploading && (
                <button onClick={() => removeFile(item.id)}
                  className="p-0.5 text-slate-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Progress summary saat uploading */}
      {uploading && (
        <div className="text-xs text-slate-500 text-center">
          Mengupload {doneCount + errorCount} / {items.length} file…
        </div>
      )}

      {/* Folder picker */}
      <div>
        <label className="section-label block mb-1">
          Simpan ke folder <span className="text-red-500">*</span>
        </label>
        <FolderPicker
          tree={foldersQ.data?.tree ?? []}
          loading={foldersQ.isLoading}
          value={subfolder}
          onChange={setSubfolder}
          programId={programId}
          onFolderCreated={() => qc.invalidateQueries({ queryKey: ['nas-folders', programId] })}
        />
        {subfolder
          ? <p className="text-[11px] text-slate-400 mt-1">Path: <span className="font-mono text-slate-600">{subfolder}</span></p>
          : <p className="text-[11px] text-amber-600 mt-1">Pilih folder tujuan sebelum upload.</p>
        }
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} disabled={uploading} className="btn-secondary">Batal</button>
        <button onClick={startUpload} disabled={!items.length || uploading} className="btn-primary">
          {uploading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengupload…</>
            : <><Upload className="w-4 h-4" /> Upload {items.length > 1 ? `${items.length} File` : 'File'}</>
          }
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder Picker — tree view + tombol bikin folder baru
// ─────────────────────────────────────────────────────────────────────────────

function FolderPicker({
  tree, loading, value, onChange, programId, onFolderCreated,
}: {
  tree: NasFolderNode[];
  loading: boolean;
  value: string;
  onChange: (v: string) => void;
  programId: string;
  onFolderCreated: () => void;
}) {
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      module3Api.createNasFolder(programId, {
        parentRelativePath: creatingUnder ?? '',
        name: newName.trim(),
      }),
    onSuccess: (res) => {
      toast.success('Folder dibuat');
      const rel = res.data.data?.relativePath;
      if (rel) onChange(rel);
      setCreatingUnder(null);
      setNewName('');
      onFolderCreated();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Gagal bikin folder'),
  });

  return (
    <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto bg-white">
      {loading ? (
        <div className="p-4 text-center text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading folder…
        </div>
      ) : tree.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-400">
          Folder program belum di-init. Upload pertama akan otomatis bikin struktur.
        </div>
      ) : (
        <div className="py-1">
          {tree.map((n) => (
            <FolderNode key={n.relativePath} node={n} depth={0}
              value={value} onChange={onChange}
              onAddSubfolder={(parent) => { setCreatingUnder(parent); setNewName(''); }}
            />
          ))}
        </div>
      )}
      {creatingUnder !== null && (
        <div className="border-t border-slate-200 p-2 bg-slate-50 flex items-center gap-2">
          <FolderPlus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-[11px] text-slate-500 font-mono truncate">
            {creatingUnder || '(root)'}/
          </span>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Nama folder baru"
            className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded"
            onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) createMut.mutate(); }} />
          <button onClick={() => createMut.mutate()} disabled={!newName.trim() || createMut.isPending}
            className="px-2 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            {createMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Buat'}
          </button>
          <button onClick={() => { setCreatingUnder(null); setNewName(''); }}
            className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {creatingUnder === null && (
        <div className="border-t border-slate-200 p-1.5 bg-slate-50">
          <button onClick={() => { setCreatingUnder(''); setNewName(''); }}
            className="w-full flex items-center justify-center gap-1.5 py-1 text-xs text-slate-600 hover:text-primary-700 hover:bg-white rounded">
            <FolderPlus className="w-3.5 h-3.5" /> Buat folder baru di root program
          </button>
        </div>
      )}
    </div>
  );
}

function FolderNode({
  node, depth, value, onChange, onAddSubfolder,
}: {
  node: NasFolderNode;
  depth: number;
  value: string;
  onChange: (v: string) => void;
  onAddSubfolder: (parentRel: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = value === node.relativePath;
  const hasChildren = node.children.length > 0;
  return (
    <>
      <div className={`group flex items-center gap-1 pr-2 py-1 cursor-pointer hover:bg-slate-50 ${
        isSelected ? 'bg-primary-50' : ''
      }`} style={{ paddingLeft: `${depth * 14 + 6}px` }}>
        <button onClick={() => setExpanded((v) => !v)} className="p-0.5 shrink-0"
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}>
          {expanded
            ? <ChevronDown className="w-3 h-3 text-slate-400" />
            : <ChevronRight className="w-3 h-3 text-slate-400" />}
        </button>
        <button onClick={() => onChange(node.relativePath)}
          className="flex-1 flex items-center gap-1.5 min-w-0 text-left">
          <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-primary-600' : 'text-amber-500'}`} />
          <span className={`text-xs truncate ${isSelected ? 'text-primary-800 font-medium' : 'text-slate-700'}`}>
            {node.name}
          </span>
          {isSelected && <Check className="w-3 h-3 text-primary-600 shrink-0" />}
        </button>
        <button onClick={() => onAddSubfolder(node.relativePath)}
          className="p-0.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-primary-700"
          title="Buat subfolder di sini">
          <FolderPlus className="w-3 h-3" />
        </button>
      </div>
      {expanded && node.children.map((c) => (
        <FolderNode key={c.relativePath} node={c} depth={depth + 1}
          value={value} onChange={onChange} onAddSubfolder={onAddSubfolder} />
      ))}
    </>
  );
}

function CreateLinkForm({
  parentType, parentId, onSuccess, onClose,
}: {
  parentType: ParentType;
  parentId: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [nama, setNama] = useState('');
  const [url, setUrl] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      parentType === 'fase_item'
        ? module3Api.createFaseItemLink(parentId, { nama: nama.trim(), url: url.trim() })
        : module3Api.createRincianLink(parentId, { nama: nama.trim(), url: url.trim() }),
    onSuccess: () => { toast.success('Tautan ditambahkan'); onSuccess(); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Gagal menyimpan tautan'),
  });

  const isValid = nama.trim().length > 0 && url.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="section-label block mb-1">Judul Tautan <span className="text-red-500">*</span></label>
        <input type="text" value={nama} onChange={(e) => setNama(e.target.value)}
          placeholder="Mis. Laporan Inspeksi 2025" className="input" />
      </div>
      <div>
        <label className="section-label block mb-1">URL <span className="text-red-500">*</span></label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://drive.google.com/..." className="input" />
        <p className="text-xs text-slate-400 mt-1">Sumber tautan akan terdeteksi otomatis dari URL.</p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="btn-secondary">Batal</button>
        <button onClick={() => createMut.mutate()} disabled={!isValid || createMut.isPending} className="btn-primary">
          {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {createMut.isPending ? 'Menyimpan…' : 'Simpan Tautan'}
        </button>
      </div>
    </div>
  );
}
