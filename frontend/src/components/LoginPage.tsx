import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../authStore';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('FJSTI');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await login(username.trim(), password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Xato');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-100 text-zinc-900 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg shadow-zinc-200/50">
        <div className="flex flex-col items-center gap-4 mb-8">
          <img
            src="/logo-fjsti.png"
            alt="FJSTI"
            className="h-28 w-28 object-contain rounded-full border border-zinc-200 bg-zinc-50 p-2"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">ClinicMonitoring</h1>
            <p className="text-sm text-zinc-600 mt-1 font-medium">Klinikaviy bemorni monitoring qilish</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 font-medium">
              {error}
            </div>
          ) : null}
          <div>
            <label htmlFor="login-user" className="block text-xs font-semibold text-zinc-700 mb-1">
              Login
            </label>
            <input
              id="login-user"
              autoComplete="username"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 font-medium placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="login-pass" className="block text-xs font-semibold text-zinc-700 mb-1">
              Parol
            </label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 font-medium focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 shadow-sm"
          >
            {loading ? 'Kutilmoqda…' : 'Kirish'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Yangi klinika va foydalanuvchilarni administrator Django Admin orqali qo‘shadi.
        </p>
      </div>
    </div>
  );
}
