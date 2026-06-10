import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, GraduationCap, School, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPortalConfig } from '../../lib/portal';

type PortalLandingPageProps = {
  variant: 'ematica' | 'srednja' | 'fakulteti';
};

const portalCopy = {
  ematica: {
    icon: Building2,
    title: 'e-Matica',
    eyebrow: 'Administrativni portal',
    description: 'Administrativni modul za škole, razrednike, evidenciju učenika, prijelaze, premještaje i završne dokumente.',
    links: [
      { to: '/admin-skole', label: 'Administracija škole' },
      { to: '/admin-skole/maticna-knjiga', label: 'Matična knjiga' },
      { to: '/teacher/svjedodzbe', label: 'Svjedodžbe' },
    ],
  },
  srednja: {
    icon: School,
    title: 'Upisi u srednje škole',
    eyebrow: 'Portal za osnovne škole i učenike',
    description: 'Ovdje će biti objedinjeni kandidati 8. razreda, rang-liste, odabir programa i administrativno povlačenje iz e-Matice.',
    links: [
      { to: '/student/ocjene', label: 'Pogled učenika' },
      { to: '/admin-skole/ucenici', label: 'Administracija učenika' },
      { to: '/admin-skole/programi', label: 'Programi i kapaciteti' },
    ],
  },
  fakulteti: {
    icon: GraduationCap,
    title: 'Upisi na fakultete',
    eyebrow: 'Portal za srednje škole i maturante',
    description: 'Ovdje će biti objedinjeni kandidati završnih razreda, prioriteti studijskih programa i kvote visokih učilišta.',
    links: [
      { to: '/student/ocjene', label: 'Pogled učenika' },
      { to: '/teacher/svjedodzbe', label: 'Svjedodžbe i završni podaci' },
      { to: '/admin-skole/programi', label: 'Programi i kvote' },
    ],
  },
} as const;

export default function PortalLandingPage({ variant }: PortalLandingPageProps) {
  const portal = getPortalConfig();
  const { user, formattedRoles } = useAuth();
  const copy = portalCopy[variant];
  const Icon = copy.icon;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-4 inline-flex items-center gap-2 bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white">
            <ShieldCheck size={14} />
            <span>{copy.eyebrow}</span>
          </div>
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center bg-[#005c8d] text-white">
                  <Icon size={28} />
                </div>
                <div>
                  <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">{copy.title}</h1>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">{portal.title}</p>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">{copy.description}</p>
            </div>
            <div className="min-w-[260px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Aktivni korisnik</p>
              <p className="mt-3 text-lg font-bold text-slate-900">{user?.name ?? 'Nepoznat korisnik'}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{formattedRoles || 'Bez uloge'}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {copy.links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="border border-slate-200 bg-white p-6 text-sm font-bold text-slate-800 transition hover:border-[#005c8d] hover:text-[#005c8d]"
            >
              {link.label}
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
