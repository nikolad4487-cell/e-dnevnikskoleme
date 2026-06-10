import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRightLeft, BookOpen, Database, FileText, GraduationCap, RefreshCw, School, Users } from 'lucide-react';
import { Header } from './Header';
import { cn } from '../lib/utils';

const EMATICA_NAV = [
  { label: 'Dashboard', path: '/ematica', icon: FileText },
  { label: 'Skole', path: '/ematica/skole', icon: School },
  { label: 'Skolske godine', path: '/ematica/skolske-godine', icon: RefreshCw },
  { label: 'Razredi', path: '/ematica/razredi', icon: GraduationCap },
  { label: 'Programi', path: '/ematica/programi', icon: BookOpen },
  { label: 'Ucenici', path: '/ematica/ucenici', icon: Users },
  { label: 'Maticna knjiga', path: '/ematica/maticna-knjiga', icon: FileText },
  { label: 'Sinkronizacija', path: '/ematica/sinkronizacija', icon: Database },
  { label: 'Premjestaji', path: '/ematica/premjestaji', icon: ArrowRightLeft },
  { label: 'Svjedodzbe', path: '/ematica/svjedodzbe', icon: GraduationCap },
  { label: 'Prijelaz godine', path: '/ematica/prijelaz-godine', icon: ArrowRightLeft },
];

export function EmaticaLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Header />
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-3 md:px-6">
          {EMATICA_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/ematica'
              ? location.pathname === '/ematica'
              : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] transition',
                  isActive
                    ? 'border-[#005c8d] bg-[#005c8d] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#005c8d] hover:text-[#005c8d]',
                )}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <main>{children}</main>
    </div>
  );
}
