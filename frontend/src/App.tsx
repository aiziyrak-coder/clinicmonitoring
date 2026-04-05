/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect } from 'react';
import { useAuthStore } from './authStore';
import { LoginPage } from './components/LoginPage';

const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
);

export default function App() {
  const checked = useAuthStore((s) => s.checked);
  const authenticated = useAuthStore((s) => s.authenticated);
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    // Har doim light mode — dark mode o'chirilgan
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
    checkSession();
  }, [checkSession]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-700 font-medium">
        Yuklanmoqda…
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage />;
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center text-zinc-700 font-medium">
          Panel yuklanmoqda…
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
