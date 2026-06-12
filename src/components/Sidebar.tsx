'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { Role } from '@/types';
import { useAuth } from '@/context/AuthContext';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: Record<Role, NavItem[]> = {
  admin: [
    { label: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
    // { label: 'Month-End & Tiers', href: '/hr/month-end', icon: '🎯' },
    { label: 'Employees', href: '/admin/employees', icon: '👥' },
    { label: 'Attendance', href: '/admin/attendance', icon: '📅' },
    { label: 'Monthly Report', href: '/admin/report', icon: '📋' },
    { label: 'Carry Forward', href: '/hr/leave-carry-forward', icon: '🔄' },
    { label: 'Compliance', href: '/hr/compliance', icon: '🛡️' },
  ],
  hr: [
    { label: 'Dashboard', href: '/hr/dashboard', icon: '📊' },
    // { label: 'Month-End & Tiers', href: '/hr/month-end', icon: '🎯' },
    { label: 'Employees', href: '/hr/employees', icon: '👥' },
    { label: 'Attendance', href: '/hr/attendance', icon: '📅' },
    { label: 'Monthly Report', href: '/hr/report', icon: '📋' },
    { label: 'Carry Forward', href: '/hr/leave-carry-forward', icon: '🔄' },
    // { label: 'Compliance', href: '/hr/compliance', icon: '🛡️' },
    { label: 'My Profile', href: '/hr/profile', icon: '👤' },
  ],
  manager: [
    { label: 'Dashboard', href: '/manager/dashboard', icon: '📊' },
    { label: 'My Team', href: '/manager/team', icon: '👥' },
    // { label: 'Month-End & Tiers', href: '/manager/month-end', icon: '🎯' },
    { label: 'Attendance', href: '/manager/attendance', icon: '📅' },
    { label: 'Monthly Report', href: '/manager/report', icon: '📋' },
    { label: 'My Profile', href: '/manager/profile', icon: '👤' },
  ],
  employee: [
    { label: 'Dashboard', href: '/employee/dashboard', icon: '📊' },
    { label: 'My Profile', href: '/employee/profile', icon: '👤' },
  ],
};

export default function Sidebar({ role: initialRole }: { role: Role }) {
  const { user } = useAuth();
  const role = user?.role || initialRole;
  const pathname = usePathname();
  const items = navItems[role] || [];

  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    setIsCollapsed(collapsed);
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  }, []);

  const toggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem('sidebar-collapsed', String(nextState));
    if (nextState) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  };

  return (
    <aside className={`fixed left-0 top-0 z-40 h-screen bg-slate-900 text-white flex flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      {/* Logo Container */}
      <div className={`relative flex items-center gap-3 px-6 py-5 border-b border-slate-700/50 ${isCollapsed ? 'justify-center px-4' : ''}`}>
        <div className="w-9 h-9 rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold shadow-lg shadow-indigo-500/25 shrink-0">
          HR
        </div>

        {!isCollapsed && (
          <div className="truncate">
            <h1 className="text-base font-semibold tracking-tight truncate">HRM System</h1>
            <p className="text-[11px] text-slate-400 capitalize truncate">{role} Portal</p>
          </div>
        )}

        {/* Toggle Button at the top right border */}
        <button
          onClick={toggleCollapse}
          className={`absolute z-50 cursor-pointer p-1.5 rounded-lg border border-slate-700/60 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 shadow-md transition-all duration-200 ${isCollapsed
            ? 'top-4 right-[-14px] scale-95'
            : 'top-5 right-4'
            }`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-4 space-y-1 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {items.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isCollapsed ? 'justify-center px-0' : 'px-3'
                } ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="text-lg shrink-0">{item.icon}</span>
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`py-3 border-t border-slate-700/50 ${isCollapsed ? 'px-0 text-center' : 'px-4'}`}>
        <p className="text-[10px] text-slate-500 font-semibold truncate leading-none">
          {isCollapsed ? "v1.0" : "HRM v1.0 · Phase 1"}
        </p>
      </div>
    </aside>
  );
}
