/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useAuthStore } from './authStore';
import { Dashboard } from './components/Dashboard';
import { LoginPage } from './components/LoginPage';

export default function App() {
  const checked = useAuthStore((s) => s.checked);
  const authenticated = useAuthStore((s) => s.authenticated);
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
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

  return <Dashboard />;
}
