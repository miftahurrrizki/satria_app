/**
 * Tab Repository — NAS Repository (file evidence per langkah)
 *
 * Layout:
 *   Left  : daftar langkah (pohon ringkas) — pilih langkah → set context upload
 *   Right : NAS folder browser (mirror Z:\SATRIA\<folder_program>)
 *           + tombol Upload (langsung ke folder langkah / sub-folder pilihan)
 *           + list evidence dari DB index untuk langkah aktif
 *
 * NAS flow:
 *   - Saat tab dibuka: pre-check NAS health 1x
 *   - Saat klik Upload: cek NAS sebelum POST. Kalau gagal → modal blocking.
 */
import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FolderOpen, Folder, File as FileIcon, Upload, Trash2, Download, Loader2, RefreshCw,
  ChevronRight, ChevronDown, ServerOff, Inbox,
} from 'lucide-react';
import { module3Api } from '../../../services/api';
import { TujuanM3, RincianM3, EvidenceFile, NasFileEntry } from '../../../types';
import { useConfirm } from '../../../components/shared/ConfirmDialog';
import { fmtBytes, fmtDate, fileIcon } from './helpers';
import { NasOfflineModal } from './NasIndicator';

export default function TabRepository({ programId, folderName }: {
  programId: string;
  folderName: string | null;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selectedRincian, setSelectedRincian] = useState<RincianM3 | null>(null);
  const [subPath, setSubPath] = useState<string>('');
  const [nasOfflineMsg, setNasOfflineMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-check NAS saat tab buka
  useEffect(() => {
    module3Api.nasHealth().then((r) => {
      if (!r.data.data?.connected) {
        setNasOfflineMsg(r.data.data?.message ?? null);
      }
    }).catch(() => setNasOfflineMsg('Tidak dapat menghubungi server.'));
  }, []);

  const { data: hierData } = useQuery({
    queryKey: ['m3-hierarki', programId],
    queryFn: () => module3Api.getHierarki(programId).then((r) => r.data.data),
  });
  const hier = hierData?.pelaksanaan;

  const { data: nasList, isLoading: nasLoading, refetch: refetchNas } = useQuery({
    queryKey: ['m3-nas-list', programId, subPath],
    queryFn: () => module3Api.listNas(programId, subPath).then((r) => r.data.data ?? []),
    enabled: Boolean(folderName),
  });

  const { data: evidenceList } = useQuery<EvidenceFile[]>({
    queryKey: ['m3-evidence-rincian', selectedRincian?.id],
    queryFn: () => module3Api.listEvidenceForRincian(selectedRincian!.id).then((r) => r.data.data ?? []),
    enabled: !!selectedRincian,
  });

  const initFolder = useMutation({
    mutationFn: () => module3Api.initFolder(programId),
    onSuccess: () => {
      toast.success('Folder NAS dibuat');
      qc.invalidateQueries({ queryKey: ['m3-overview', programId] });
      refetchNas();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Gagal membuat folder NAS';
      if (err?.response?.status === 503) setNasOfflineMsg(msg);
      else toast.error(msg);
    },
  });

  const uploadMut = useMutation({
    mutationFn: ({ file, rincianId }: { file: File; rincianId: string }) =>
      module3Api.uploadEvidence(rincianId, file),
    onSuccess: () => {
      toast.success('File terupload ke NAS');
      qc.invalidateQueries({ queryKey: ['m3-evidence-rincian', selectedRincian?.id] });
      qc.invalidateQueries({ queryKey: ['m3-nas-list', programId] });
      qc.invalidateQueries({ queryKey: ['m3-hierarki', programId] });
      qc.invalidateQueries({ queryKey: ['m3-overview', programId] });
      refetchNas();
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message ?? 'Gagal upload';
      if (status === 503 || err?.response?.data?.code === 'NAS_UNAVAILABLE') {
        setNasOfflineMsg(msg);
      } else toast.error(msg);
    },
  });

  const deleteEv = useMutation({
    mutationFn: (id: string) => module3Api.deleteEvidence(id),
    onSuccess: () => {
      toast.success('Evidence dihapus');
      qc.invalidateQueries({ queryKey: ['m3-evidence-rincian', selectedRincian?.id] });
      qc.invalidateQueries({ queryKey: ['m3-nas-list', programId] });
      qc.invalidateQueries({ queryKey: ['m3-overview', programId] });
      refetchNas();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Gagal hapus'),
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedRincian) return;

    // Active NAS check
    const health = await module3Api.nasHealth().then((r) => r.data.data).catch(() => null);
    if (!health?.connected) {
      setNasOfflineMsg(health?.message ?? null);
      return;
    }
    uploadMut.mutate({ file, rincianId: selectedRincian.id });
  }

  // Empty state — folder belum dibuat
  if (!folderName) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <FolderOpen className="w-12 h-12 mx-auto text-slate-300" strokeWidth={1.5} />
        <p className="mt-3 text-sm text-slate-600 font-medium">Folder NAS belum dibuat</p>
        <p className="text-xs text-slate-400 mt-1">
          Buat folder otomatis di NAS untuk program ini sebelum mulai upload evidence.
        </p>
        <button
          onClick={() => initFolder.mutate()}
          disabled={initFolder.isPending}
          className="mt-4 btn-primary"
        >
          {initFolder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
          Buat Folder NAS
        </button>
        <NasOfflineModal
          open={!!nasOfflineMsg}
          message={nasOfflineMsg ?? undefined}
          onClose={() => setNasOfflineMsg(null)}
          onRetry={() => { setNasOfflineMsg(null); initFolder.mutate(); }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      {/* LEFT: Pilih langkah */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-3 max-h-[70vh] overflow-y-auto">
        <p className="section-label mb-2">Pilih Langkah</p>
        {(hier ?? []).length === 0 ? (
          <p className="text-xs text-slate-400 italic">Hierarki kosong.</p>
        ) : (
          <RincianPicker
            hier={hier ?? []}
            selectedId={selectedRincian?.id ?? null}
            onSelect={setSelectedRincian}
          />
        )}
      </div>

      {/* RIGHT: NAS browser + upload + evidence list */}
      <div className="lg:col-span-8 space-y-3">
        {/* Upload bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-slate-500">
            {selectedRincian ? (
              <>Upload akan masuk ke folder langkah: <span className="font-mono text-slate-700">Langkah_{selectedRincian.id.slice(0, 8)}</span></>
            ) : (
              <span className="italic">Pilih langkah dulu untuk upload</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" onChange={handleUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!selectedRincian || uploadMut.isPending}
              className="btn-sm"
            >
              {uploadMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload File
            </button>
          </div>
        </div>

        {/* Evidence list utk langkah aktif */}
        {selectedRincian && (
          <div className="bg-white border border-slate-200 rounded-2xl">
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">
                Evidence Langkah: <span className="text-slate-500 font-normal">{selectedRincian.title}</span>
              </p>
              <p className="text-xs text-slate-400">{evidenceList?.length ?? 0} file</p>
            </div>
            {!evidenceList || evidenceList.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                <Inbox className="w-8 h-8 mx-auto opacity-50" />
                <p className="mt-1">Belum ada evidence yang diupload untuk langkah ini.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {evidenceList.map((ev) => (
                  <li key={ev.id} className="px-3 py-2 flex items-center gap-3">
                    <span className="text-lg leading-none">{fileIcon(ev.nama_asli, ev.mime_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{ev.nama_asli}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {fmtBytes(ev.ukuran_byte)} • {fmtDate(ev.uploaded_at)} • oleh {ev.uploaded_by_nama}
                      </p>
                    </div>
                    <a
                      href={module3Api.downloadEvidenceUrl(ev.id)}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
                      title="Download"
                    ><Download className="w-4 h-4" /></a>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          variant: 'danger',
                          title: 'Hapus File Evidence?',
                          description: (
                            <>
                              File <b className="text-slate-800">"{ev.nama_asli}"</b> akan dihapus
                              <b> permanen</b> dari NAS dan tidak bisa dipulihkan.<br />
                              Pastikan file ini sudah tidak diperlukan untuk dokumentasi audit.
                            </>
                          ),
                          confirmLabel: 'Ya, Hapus File',
                        });
                        if (ok) deleteEv.mutate(ev.id);
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      title="Hapus"
                    ><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* NAS browser */}
        <div className="bg-white border border-slate-200 rounded-2xl">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0 flex-1">
              <FolderOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="font-mono truncate">
                Z:\SATRIA\{folderName}{subPath ? `\\${subPath.replace(/\//g, '\\')}` : ''}
              </span>
            </div>
            <button
              onClick={() => refetchNas()}
              disabled={nasLoading}
              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${nasLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Breadcrumb */}
          {subPath && (
            <div className="px-3 py-1.5 border-b border-slate-100 text-xs text-slate-500 flex items-center gap-1">
              <button onClick={() => setSubPath('')} className="hover:underline">Root</button>
              {subPath.split('/').filter(Boolean).map((seg, idx, arr) => (
                <span key={idx} className="inline-flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" />
                  <button
                    onClick={() => setSubPath(arr.slice(0, idx + 1).join('/'))}
                    className="hover:underline"
                  >{seg}</button>
                </span>
              ))}
            </div>
          )}

          {nasLoading ? (
            <div className="p-6 text-center text-xs text-slate-400 inline-flex items-center gap-2 justify-center w-full">
              <Loader2 className="w-4 h-4 animate-spin" /> Membaca folder NAS…
            </div>
          ) : !nasList || nasList.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-slate-400">
              <ServerOff className="w-8 h-8 mx-auto opacity-30" />
              <p className="mt-1">Folder kosong{nasOfflineMsg ? ' atau NAS terputus' : ''}.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
              {nasList.map((entry: NasFileEntry) => (
                <li
                  key={entry.relativePath}
                  className="px-3 py-2 flex items-center gap-3 hover:bg-slate-50"
                >
                  {entry.isDirectory ? (
                    <button
                      onClick={() => setSubPath(entry.relativePath)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{entry.name}</span>
                      <span className="text-xs text-slate-400 ml-auto">{fmtDate(entry.modifiedAt)}</span>
                    </button>
                  ) : (
                    <>
                      <FileIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate flex-1">{entry.name}</span>
                      <span className="text-xs text-slate-400">{fmtBytes(entry.size)}</span>
                      <span className="text-xs text-slate-400">{fmtDate(entry.modifiedAt)}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <NasOfflineModal
        open={!!nasOfflineMsg}
        message={nasOfflineMsg ?? undefined}
        onClose={() => setNasOfflineMsg(null)}
        onRetry={() => {
          setNasOfflineMsg(null);
          module3Api.nasHealth().then((r) => {
            if (!r.data.data?.connected) setNasOfflineMsg(r.data.data?.message ?? null);
            else refetchNas();
          });
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact picker (left panel)
// ─────────────────────────────────────────────────────────────────────────────
function RincianPicker({ hier, selectedId, onSelect }: {
  hier: TujuanM3[]; selectedId: string | null; onSelect: (r: RincianM3) => void;
}) {
  return (
    <div className="space-y-1 text-sm">
      {hier.map((t) => (
        <PickerNode
          key={t.id}
          title={t.title}
          level={0}
          children_={t.risiko.map((r) => (
            <PickerNode
              key={r.id}
              title={r.title}
              level={1}
              children_={r.prosedur.map((p) => (
                <PickerNode
                  key={p.id}
                  title={p.title}
                  level={2}
                  children_={p.rincian.map((langkah) => (
                    <button
                      key={langkah.id}
                      onClick={() => onSelect(langkah)}
                      className={[
                        'w-full text-left px-2 py-1 rounded text-xs',
                        selectedId === langkah.id
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                      style={{ paddingLeft: 16 + 12 * 3 }}
                    >
                      • {langkah.title}
                      {langkah.evidence_count > 0 && (
                        <span className="ml-1 text-xs text-primary-600">📎{langkah.evidence_count}</span>
                      )}
                    </button>
                  ))}
                />
              ))}
            />
          ))}
        />
      ))}
    </div>
  );
}

function PickerNode({ title, level, children_ }: { title: string; level: number; children_: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1 text-xs text-slate-600 hover:bg-slate-50 rounded px-1 py-0.5 text-left"
        style={{ paddingLeft: 4 + 12 * level }}
      >
        {open ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
        <span className="truncate font-medium">{title}</span>
      </button>
      {open && <div className="space-y-0.5">{children_}</div>}
    </div>
  );
}
