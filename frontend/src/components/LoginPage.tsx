import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../authStore';
import { apiUrl } from '../lib/api';

type Mode = 'login' | 'register';

interface RegisterForm {
  clinic_name: string;
  director_name: string;
  clinic_phone: string;
  clinic_email: string;
  clinic_address: string;
  bed_count: string;
  username: string;
  password: string;
  password2: string;
}

const EMPTY_REGISTER: RegisterForm = {
  clinic_name: '', director_name: '', clinic_phone: '',
  clinic_email: '', clinic_address: '', bed_count: '',
  username: '', password: '', password2: '',
};

export function LoginPage() {
  const login   = useAuthStore((s) => s.login);
  const [mode, setMode] = useState<Mode>('login');

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [reg, setReg]         = useState<RegisterForm>(EMPTY_REGISTER);
  const [regDone, setRegDone] = useState(false);

  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ─── LOGIN ──────────────────────────────────────────────────────────────────
  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await login(username.trim(), password);
    setLoading(false);
    if (!res.ok) setError(res.error ?? 'Xato');
  };

  // ─── REGISTER ───────────────────────────────────────────────────────────────
  const onRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reg.clinic_name.trim())  return setError('Klinika nomi talab qilinadi.');
    if (!reg.username.trim())     return setError('Login talab qilinadi.');
    if (reg.username.trim().length < 3) return setError('Login kamida 3 ta belgi.');
    if (!reg.password)            return setError('Parol talab qilinadi.');
    if (reg.password.length < 6)  return setError('Parol kamida 6 ta belgi.');
    if (reg.password !== reg.password2) return setError('Parollar mos kelmadi.');

    setLoading(true);
    try {
      const r = await fetch(apiUrl('/api/auth/register/'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_name:    reg.clinic_name.trim(),
          director_name:  reg.director_name.trim(),
          clinic_phone:   reg.clinic_phone.trim(),
          clinic_email:   reg.clinic_email.trim(),
          clinic_address: reg.clinic_address.trim(),
          bed_count:      parseInt(reg.bed_count || '0', 10),
          username:       reg.username.trim(),
          password:       reg.password,
        }),
      });
      const d = await r.json() as { success?: boolean; message?: string; detail?: string; errors?: Record<string, string> };
      if (!r.ok) {
        const fieldErrors = d.errors ? Object.values(d.errors).join(' ') : '';
        setError(d.detail ?? fieldErrors ?? `Xato: ${r.status}`);
      } else {
        setRegDone(true);
      }
    } catch {
      setError("Tarmoq xatosi. Internetni tekshiring.");
    } finally {
      setLoading(false);
    }
  };

  const setRegField = (field: keyof RegisterForm, value: string) =>
    setReg(prev => ({ ...prev, [field]: value }));

  // ─── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-100 text-zinc-900 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-lg shadow-zinc-200/50 overflow-hidden">

        {/* Header */}
        <div className="flex flex-col items-center gap-3 pt-8 pb-6 px-8 border-b border-zinc-100">
          <img
            src="/logo-fjsti.png"
            alt="MediCentral"
            className="h-20 w-20 object-contain rounded-full border border-zinc-200 bg-zinc-50 p-2"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">MediCentral</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Klinikaviy monitoring tizimi</p>
          </div>

          {/* Tab */}
          <div className="flex w-full rounded-xl bg-zinc-100 p-1 mt-2">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'login' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >Kirish</button>
            <button
              onClick={() => { setMode('register'); setError(null); setRegDone(false); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'register' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >Ro'yxatdan o'tish</button>
          </div>
        </div>

        <div className="p-8">
          {/* Xato */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 font-medium">
              {error}
            </div>
          )}

          {/* ─── LOGIN FORM ─── */}
          {mode === 'login' && (
            <form onSubmit={onLogin} className="space-y-4">
              <Field id="l-user" label="Login">
                <input
                  id="l-user" autoComplete="username"
                  className={inputCls}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
              </Field>
              <Field id="l-pass" label="Parol">
                <input
                  id="l-pass" type="password" autoComplete="current-password"
                  className={inputCls}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </Field>
              <button type="submit" disabled={loading} className={btnCls}>
                {loading ? 'Tekshirilmoqda…' : 'Kirish'}
              </button>
            </form>
          )}

          {/* ─── REGISTER FORM ─── */}
          {mode === 'register' && !regDone && (
            <form onSubmit={onRegister} className="space-y-4">
              <p className="text-sm text-zinc-500 -mt-2 mb-2">
                So'rovingiz admin tomonidan ko'rib chiqilgandan so'ng hisobingiz faollashtiriladi.
              </p>

              <Field id="r-cname" label="Klinika nomi *">
                <input id="r-cname" className={inputCls}
                  placeholder="Masalan: Ibn Sino Tibbiyot Markazi"
                  value={reg.clinic_name} onChange={e => setRegField('clinic_name', e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field id="r-dir" label="Direktor ismi">
                  <input id="r-dir" className={inputCls}
                    placeholder="F.I.O."
                    value={reg.director_name} onChange={e => setRegField('director_name', e.target.value)} />
                </Field>
                <Field id="r-beds" label="Karavot soni">
                  <input id="r-beds" type="number" min="0" className={inputCls}
                    placeholder="0"
                    value={reg.bed_count} onChange={e => setRegField('bed_count', e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field id="r-phone" label="Telefon">
                  <input id="r-phone" className={inputCls}
                    placeholder="+998 90 123 45 67"
                    value={reg.clinic_phone} onChange={e => setRegField('clinic_phone', e.target.value)} />
                </Field>
                <Field id="r-email" label="Email">
                  <input id="r-email" type="email" className={inputCls}
                    placeholder="info@klinika.uz"
                    value={reg.clinic_email} onChange={e => setRegField('clinic_email', e.target.value)} />
                </Field>
              </div>

              <Field id="r-addr" label="Manzil">
                <input id="r-addr" className={inputCls}
                  placeholder="Shahar, ko'cha, bino"
                  value={reg.clinic_address} onChange={e => setRegField('clinic_address', e.target.value)} />
              </Field>

              <div className="border-t border-zinc-100 pt-4">
                <p className="text-xs font-semibold text-zinc-500 mb-3 uppercase tracking-wide">Kirish ma'lumotlari</p>
                <div className="grid grid-cols-1 gap-3">
                  <Field id="r-uname" label="Login (username) *">
                    <input id="r-uname" autoComplete="username" className={inputCls}
                      placeholder="klinika_login"
                      value={reg.username} onChange={e => setRegField('username', e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="r-pw" label="Parol *">
                      <input id="r-pw" type="password" autoComplete="new-password" className={inputCls}
                        placeholder="Kamida 6 belgi"
                        value={reg.password} onChange={e => setRegField('password', e.target.value)} />
                    </Field>
                    <Field id="r-pw2" label="Parolni tasdiqlang *">
                      <input id="r-pw2" type="password" autoComplete="new-password" className={inputCls}
                        placeholder="Takrorlang"
                        value={reg.password2} onChange={e => setRegField('password2', e.target.value)} />
                    </Field>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={loading} className={btnCls}>
                {loading ? 'Yuborilmoqda…' : 'So\'rov yuborish'}
              </button>
            </form>
          )}

          {/* ─── REGISTER MUVAFFAQIYATLI ─── */}
          {mode === 'register' && regDone && (

            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-zinc-900 mb-2">So'rov yuborildi!</h2>
              <p className="text-sm text-zinc-600 mb-6">
                Klinikangiz ma'lumotlari adminlar tomonidan ko'rib chiqiladi.
                Tasdiqlanganingizdan so'ng tizimga kirishingiz mumkin bo'ladi.
              </p>
              <button
                onClick={() => { setMode('login'); setRegDone(false); setReg(EMPTY_REGISTER); setError(null); }}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Kirish sahifasiga o'tish →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── YORDAMCHI KOMPONENTLAR ──────────────────────────────────────────────────

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-zinc-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";
const btnCls   = "w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white text-sm hover:bg-emerald-500 disabled:opacity-50 shadow-sm transition-colors";
