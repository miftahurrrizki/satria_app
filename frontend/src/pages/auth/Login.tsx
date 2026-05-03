import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { User } from '../../types';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const setAuth  = useAuthStore((s) => s.setAuth);
  
  const [nik, setNik]           = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [loginError, setLoginError] = useState('');
  const [errorCode,  setErrorCode]  = useState<'NIK_NOT_FOUND' | 'INVALID_PASSWORD' | 'ACCOUNT_INACTIVE' | 'GENERIC' | ''>('');

  // Link WhatsApp Admin SPI
  const waNumber = '628771140555';
  const waMessage = encodeURIComponent('Halo Admin SPI, saya membutuhkan bantuan karena lupa password/kendala akses pada akun SATRIA saya.');
  const waLink = `https://wa.me/${waNumber}?text=${waMessage}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nik || !password) return;
    if (nik.length !== 6) {
      setLoginError('NIK harus tepat 6 digit angka.');
      return;
    }

    setLoading(true);
    setLoginError('');
    setErrorCode('');

    try {
      const res = await authApi.login(nik, password);
      const { user } = res.data.data as { user: User };
      setAuth(user);
      toast.success(`Selamat datang, ${user.nama}!`);
      navigate('/');
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; code?: string } } })?.response?.data;
      const rawMsg = resp?.message ?? '';
      // Fallback: jika backend belum update (tanpa field `code`), coba deteksi
      // dari pesan. Kalau pesan generik "NIK atau password salah" kita anggap
      // NIK tidak terdaftar karena kita tidak bisa bedakan — lebih informatif
      // daripada kosong.
      let code = (resp?.code ?? '') as typeof errorCode;
      if (!code) {
        if (/tidak terdaftar|belum terdaftar|not found/i.test(rawMsg)) code = 'NIK_NOT_FOUND';
        else if (/password/i.test(rawMsg)) code = 'INVALID_PASSWORD';
        else if (/tidak aktif|inactive/i.test(rawMsg)) code = 'ACCOUNT_INACTIVE';
        else code = 'GENERIC';
      }
      const msg = rawMsg || 'Tidak dapat terhubung ke server. Silakan coba lagi.';

      setErrorCode(code);
      setLoginError(msg);
      // Fokuskan kursor ke field yg bermasalah tanpa menghapus nilainya
      if (code === 'INVALID_PASSWORD') {
        setPassword('');
        setTimeout(() => document.querySelector<HTMLInputElement>('input[type="password"], input[autocomplete="current-password"]')?.focus(), 0);
      } else if (code === 'NIK_NOT_FOUND') {
        setTimeout(() => document.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.focus(), 0);
      }
      toast.error(code === 'NIK_NOT_FOUND' ? 'NIK belum terdaftar' : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 relative flex items-center justify-center p-4 overflow-hidden">
      
      {/* Ornamen Background Lembut */}
      <div className="absolute top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-primary-50 to-slate-50 pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary-100/50 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-100/40 rounded-full blur-[80px] pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10">
        
        {/* Logo & Judul */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-600 rounded-2xl shadow-md mb-5">
            <ShieldCheck className="w-8 h-8 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-slate-900 font-extrabold text-3xl tracking-tight mb-2">SATRIA</h1>
          <p className="text-slate-500 text-sm font-medium">Sistem Akuntabilitas Internal Audit</p>
        </div>

        {/* Card Form */}
        <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Masuk ke sistem</h2>
          <p className="text-slate-500 text-sm mb-6">Gunakan akun yang telah diberikan oleh Tim SPI.</p>

          {/* Kotak Error Inline */}
          {loginError && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3 text-red-600 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium leading-relaxed">{loginError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Input NIK */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">NIK</label>
              <input
                type="text"
                required
                autoComplete="username"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={nik}
                onChange={(e) => {
                  setNik(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (errorCode === 'NIK_NOT_FOUND') { setErrorCode(''); setLoginError(''); }
                }}
                placeholder="6 digit NIK"
                className={`w-full bg-white border text-slate-800 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 transition-all placeholder:text-slate-400 shadow-sm ${
                  (nik.length > 0 && nik.length !== 6) || errorCode === 'NIK_NOT_FOUND'
                    ? 'border-red-400 focus:ring-red-500/20 focus:border-red-500'
                    : 'border-slate-200 focus:ring-primary-500/20 focus:border-primary-500'
                }`}
              />
              {nik.length > 0 && nik.length !== 6 && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  NIK harus tepat 6 digit angka. Saat ini: {nik.length} digit.
                </p>
              )}
              {errorCode === 'NIK_NOT_FOUND' && nik.length === 6 && (
                <p className="mt-1.5 text-xs font-semibold text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  NIK {nik} belum terdaftar pada sistem.
                </p>
              )}
            </div>

            {/* Input Password */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorCode === 'INVALID_PASSWORD') { setErrorCode(''); setLoginError(''); }
                  }}
                  placeholder="••••••••"
                  className={`w-full bg-white border text-slate-800 text-sm rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 transition-all placeholder:text-slate-400 tracking-wide shadow-sm ${
                    errorCode === 'INVALID_PASSWORD'
                      ? 'border-red-400 focus:ring-red-500/20 focus:border-red-500'
                      : 'border-slate-200 focus:ring-primary-500/20 focus:border-primary-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errorCode === 'INVALID_PASSWORD' && (
                <p className="mt-1.5 text-xs font-semibold text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Password salah. Silakan coba lagi.
                </p>
              )}
            </div>

            {/* Tombol Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 text-white font-bold rounded-xl py-3 mt-2 hover:bg-primary-700 hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? 'Memverifikasi...' : 'Masuk ke SATRIA'}
            </button>

            {/* Informasi Lupa Password di Bawah Tombol */}
            <div className="pt-4 mt-2 border-t border-slate-100 text-center">
              <p className="text-sm text-slate-500">
                Lupa password atau terkendala akses? <br className="sm:hidden" />
                <a 
                  href={waLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-bold text-primary-600 hover:text-primary-700 hover:underline transition-all ml-1"
                >
                  Hubungi Admin SPI
                </a>
              </p>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs mt-8 font-medium leading-relaxed">
          © {new Date().getFullYear()} SATRIA · Satuan Pengawas Internal <br/>
          PT Transportasi Jakarta
        </p>
      </div>
    </div>
  );
}