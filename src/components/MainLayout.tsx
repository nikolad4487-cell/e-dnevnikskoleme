import React from 'react';
import { Header } from './Header';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header />
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 lg:p-8">
        {children}
      </main>
    </div>
  );
}
