'use client';

import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar role="manager" />
      <TopBar />
      <main className="main-content pt-24 px-6 pb-6">
        {children}
      </main>
    </div>
  );
}
