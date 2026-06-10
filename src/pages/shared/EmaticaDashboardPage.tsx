import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightLeft, BookOpen, Database, FileText, GraduationCap, RefreshCw, School, Users } from 'lucide-react';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';

const primaryActions = [
  {
    title: 'Matična knjiga',
    description: 'Pregled i uređivanje službenih podataka učenika, razreda, programa i statusa školovanja.',
    to: '/ematica/maticna-knjiga',
    icon: FileText,
  },
  {
    title: 'Učenici škole',
    description: 'Administrativni pregled učenika, upisa i osnovnih podataka za odabranu školu.',
    to: '/ematica/ucenici',
    icon: Users,
  },
  {
    title: 'Programi i smjerovi',
    description: 'Upravljanje programima koji se koriste za e-Maticu i kasnije za e-Upise.',
    to: '/ematica/programi',
    icon: BookOpen,
  },
  {
    title: 'Prijelaz godine',
    description: 'Rollover učenika i razreda u novu školsku godinu s očuvanjem povezanih podataka.',
    to: '/ematica/prijelaz-godine',
    icon: RefreshCw,
  },
];

const workflowActions = [
  {
    title: 'Razredi i odjeljenja',
    description: 'Postavljanje razreda, odjeljenja, razrednika i organizacije školske godine.',
    to: '/ematica/razredi',
    icon: School,
  },
  {
    title: 'Svjedodžbe',
    description: 'Zaključivanje i generiranje svjedodžbi iz podataka povučenih iz e-Dnevnika.',
    to: '/ematica/svjedodzbe',
    icon: GraduationCap,
  },
  {
    title: 'Sinkronizacija s e-Dnevnikom',
    description: 'Priprema mosta između administrativnog dijela i razrednog rada u e-Dnevniku.',
    to: '/ematica/sinkronizacija',
    icon: Database,
  },
  {
    title: 'Premještaji i prijenosi',
    description: 'Operativni dio za prijelaze učenika između škola, programa i školskih godina.',
    to: '/ematica/premjestaji',
    icon: ArrowRightLeft,
  },
];

export default function EmaticaDashboardPage() {
  const navigate = useNavigate();
  const { selectedSchoolId, selectedClassId } = useSelection();
  const { user, formattedRoles } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                <FileText size={14} />
                <span>e-Matica</span>
              </div>
              <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">Administrativni centar škole</h1>
              <p className="text-sm leading-7 text-slate-600">
                Ovdje okupljamo administrativne procese koji hrane cijeli sustav: službenu evidenciju učenika, programe, razrede,
                prijelaze, završne dokumente i pripremu podataka za e-Upise.
              </p>
            </div>
            <div className="min-w-[280px] space-y-3 border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Korisnik</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{user?.name ?? 'Nepoznat korisnik'}</p>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{formattedRoles || 'Bez uloge'}</p>
              </div>
              <div className="border-t border-slate-200 pt-3 text-xs text-slate-600">
                <p>Odabrana škola: {selectedSchoolId ? 'postavljena' : 'nije odabrana'}</p>
                <p>Odabrani razred: {selectedClassId ? 'postavljen' : 'nije odabran'}</p>
              </div>
              {!selectedSchoolId && (
                <button
                  type="button"
                  onClick={() => navigate('/admin/schools')}
                  className="w-full bg-[#005c8d] px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-[#00486f]"
                >
                  Odaberi školu
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {primaryActions.map((item) => (
            <Link key={item.to} to={item.to} className="border border-slate-200 bg-white p-6 transition hover:border-[#005c8d] hover:shadow-sm">
              <item.icon size={20} className="mb-4 text-[#005c8d]" />
              <h2 className="text-sm font-black uppercase tracking-[0.08em] text-slate-900">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Operativni tok</h2>
            <div className="mt-6 space-y-4">
              {workflowActions.map((item, index) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex gap-4 border border-slate-200 p-4 transition hover:border-[#005c8d] hover:bg-slate-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-slate-900 text-xs font-black text-white">
                    {index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <item.icon size={18} className="text-[#005c8d]" />
                      <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Što slijedi</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                <li>Sinkronizacija početka i kraja godine između e-Matice i e-Dnevnika.</li>
                <li>Ručno i automatsko upravljanje prijelazima učenika između školskih godina i ustanova.</li>
                <li>Odvajanje procesa za srednjaške i fakultetske upise po subdomenama.</li>
              </ul>
            </div>
            <div className="border border-[#cfe3f1] bg-[#f3f8fc] p-6 text-sm leading-6 text-[#0f3550] shadow-sm">
              e-Matica treba ostati administrativno središte. e-Dnevnik ostaje radni alat za nastavnike, a e-Upisi preuzimaju
              samo potrebne podatke i vode prijavne procese na svojim domenama.
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
