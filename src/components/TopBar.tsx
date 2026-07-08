'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Badge from './Badge';
import NotificationBell from './NotificationBell';

export default function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Search API fetch with debounce
  useEffect(() => {
    if (!searchQuery.trim() || !user || user.role === 'employee') {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await fetch(`/api/employees?search=${encodeURIComponent(searchQuery)}&limit=15`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.employees || []);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, user]);

  // Click away listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectEmployee = (empId: string) => {
    if (!user) return;
    const targetPath = user.role === 'manager' 
      ? `/manager/team/${empId}` 
      : `/hr/employees/${empId}`;
    
    setSearchQuery('');
    setShowDropdown(false);
    router.push(targetPath);
  };

  return (
    <header className="fixed top-0 left-64 right-0 topbar-content z-50 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-800 shrink-0">
          Welcome back, <span className="text-indigo-600">{user?.name || 'User'}</span>
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {/* Search Bar Component */}
        {user?.role && user.role !== 'employee' && (
          <div ref={searchRef} className="relative w-64 mr-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search employee profile..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-8 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all h-9 shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {showDropdown && searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-2xl z-[100] max-h-64 overflow-y-auto p-1.5 ring-1 ring-black/5 animate-in fade-in duration-150 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                {isSearching ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-xs font-semibold select-none">
                    <svg className="w-4 h-4 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                    </svg>
                    <span>Searching...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-0.5">
                    {searchResults.map((emp) => (
                      <button
                        key={emp._id}
                        type="button"
                        onClick={() => handleSelectEmployee(emp._id)}
                        className="w-full flex items-center justify-between text-left px-3 py-2 text-xs font-semibold rounded-xl hover:bg-slate-50 transition duration-155 cursor-pointer text-slate-700 hover:text-slate-900 border-none outline-none"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800">{emp.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{emp.email}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200/30">
                          {emp.department}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs font-semibold select-none">
                    No employees found
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
