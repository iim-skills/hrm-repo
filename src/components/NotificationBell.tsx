'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [sandwichCount, setSandwichCount] = useState(0);
  const [lateCount, setLateCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close dropdown when clicking outside
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [compRes, lateRes] = await Promise.all([
          fetch('/api/compliance'),
          fetch('/api/attendance/late-override')
        ]);
        
        if (compRes.ok) {
          const compData = await compRes.json();
          // Assuming sandwichFlags is an array of active flags
          setSandwichCount(compData.sandwichFlags?.length || 0);
        }
        
        if (lateRes.ok) {
          const lateData = await lateRes.json();
          // Assuming requests is an array of late overrides
          setLateCount(lateData.requests?.length || 0);
        }
      } catch (err) {
        console.error('Failed to fetch notification counts', err);
      }
    };
    
    fetchCounts();
    
    // Optional: Poll every 5 minutes for new notifications
    const interval = setInterval(fetchCounts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const totalNotifications = sandwichCount + lateCount;

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors focus:outline-none"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        
        {totalNotifications > 0 && (
          <span className="absolute top-1 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
            {totalNotifications > 99 ? '99+' : totalNotifications}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">System Alerts</h3>
            <p className="text-xs text-slate-500 mt-0.5">Current month compliance notifications</p>
          </div>
          
          <div className="max-h-80 overflow-y-auto">
            {totalNotifications === 0 ? (
              <div className="px-4 py-8 text-center flex flex-col items-center justify-center text-slate-400">
                <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">You&apos;re all caught up!</p>
              </div>
            ) : (
              <div className="py-2">
                {sandwichCount > 0 && (
                  <div className="px-4 py-3 hover:bg-slate-50 transition-colors border-l-4 border-transparent hover:border-indigo-500">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                        <span className="text-lg leading-none">🥪</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Sandwich Conversions</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-bold text-rose-500">{sandwichCount}</span> active sandwich flag{sandwichCount > 1 ? 's' : ''} detected.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {lateCount > 0 && (
                  <div className="px-4 py-3 hover:bg-slate-50 transition-colors border-l-4 border-transparent hover:border-amber-500">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                        <span className="text-lg leading-none">⏰</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Late Arrivals</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-bold text-amber-600">{lateCount}</span> late arrival alert{lateCount > 1 ? 's' : ''} detected.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="p-3 border-t border-slate-100 bg-slate-50">
            <Link 
              href="/hr/compliance" 
              onClick={() => setIsOpen(false)}
              className="block w-full text-center px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
            >
              View All in Compliance Hub
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
