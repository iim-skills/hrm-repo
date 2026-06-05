'use client';

import { useAuth } from '@/context/AuthContext';
import Badge from './Badge';
import NotificationBell from './NotificationBell';

export default function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-0 left-64 right-0 topbar-content z-50 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-800">
          Welcome back, <span className="text-indigo-600">{user?.name || 'User'}</span>
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {user?.role === 'admin' && <NotificationBell />}
        <Badge variant={user?.role || 'employee'} label={user?.role?.toUpperCase() || 'USER'} />
        <div className="h-5 w-px bg-slate-200" />
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </header>
  );
}
