import React from 'react';
import { GraduationCap, Search } from 'lucide-react';
import { useSelection } from '../../contexts/SelectionContext';
import { supabase } from '../../lib/supabase';
import { formatPersonName } from '../../lib/utils';
import { User } from '../../types';
import { mappers } from '../../lib/mappers';

type MaturaRegistration = {
  id: string;
  student_id: string;
  class_id?: string | null;
  school_id?: string | null;
  subject_name: string;
  level: 'A_RAZINA' | 'B_RAZINA' | 'JEDNA_RAZINA';
  status: 'REGISTERED' | 'CANCELED';
  exam_location?: string | null;
  created_at?: string;
  updated_at?: string;
};

const levelLabels: Record<MaturaRegistration['level'], string> = {
  A_RAZINA: 'Viša razina',
  B_RAZINA: 'Osnovna razina',
  JEDNA_RAZINA: 'Jedna razina',
};

const statusLabels: Record<MaturaRegistration['status'], string> = {
  REGISTERED: 'Prijavljeno',
  CANCELED: 'Odjavljeno',
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('hr-HR', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function MaturaTeacherPage() {
  const { selectedClassId, selectedSchoolId } = useSelection();
  const [registrations, setRegistrations] = React.useState<MaturaRegistration[]>([]);
  const [students, setStudents] = React.useState<Record<string, User>>({});
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | MaturaRegistration['status']>('REGISTERED');

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedSchoolId) params.set('schoolId', selectedSchoolId);
        if (selectedClassId) params.set('classId', selectedClassId);

        const response = await fetch(`/api/matura-registrations?${params.toString()}`);
        if (!response.ok) throw new Error('Fetch failed');
        const items: MaturaRegistration[] = await response.json();
        setRegistrations(items);

        const studentIds = [...new Set(items.map(item => item.student_id).filter(Boolean))];
        if (studentIds.length > 0) {
          const { data } = await supabase
            .from('user_profiles')
            .select('*')
            .in('id', studentIds);

          const map: Record<string, User> = {};
          (data || []).forEach(profile => {
            const user = mappers.user(profile) as User;
            map[user.id] = user;
          });
          setStudents(map);
        } else {
          setStudents({});
        }
      } catch (error) {
        console.error('MATURA TEACHER LOAD ERROR', error);
        setRegistrations([]);
        setStudents({});
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedClassId, selectedSchoolId]);

  const filtered = registrations.filter(item => {
    const studentName = formatPersonName(students[item.student_id]);
    const haystack = `${studentName} ${item.subject_name} ${item.exam_location || ''}`.toLowerCase();
    const matchesSearch = haystack.includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 md:p-6 w-full min-h-full bg-white font-sans">
      <div className="border-b border-slate-200 pb-4 mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[#005c8d] text-white flex items-center justify-center">
            <GraduationCap size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-950 uppercase tracking-tight">Matura</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Pregled prijava ispita državne mature</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pretraži učenika ili predmet..."
              className="w-full sm:w-72 border border-slate-300 rounded-sm pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005c8d]/20"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="border border-slate-300 rounded-sm px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#005c8d]/20"
          >
            <option value="REGISTERED">Prijavljeni</option>
            <option value="CANCELED">Odjavljeni</option>
            <option value="ALL">Svi statusi</option>
          </select>
        </div>
      </div>

      <section className="border border-slate-200 rounded-sm bg-white shadow-sm overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#005c8d]">Prijave učenika</h2>
          <span className="text-[11px] font-black text-slate-500">{filtered.length}</span>
        </div>

        {loading ? (
          <div className="px-4 py-12 text-center text-sm text-slate-400 italic">Učitavanje prijava mature...</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-400 italic">Nema pronađenih prijava mature.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-black">Učenik</th>
                  <th className="text-left px-4 py-3 font-black">Predmet</th>
                  <th className="text-left px-4 py-3 font-black">Razina</th>
                  <th className="text-left px-4 py-3 font-black">Mjesto pisanja</th>
                  <th className="text-left px-4 py-3 font-black">Status</th>
                  <th className="text-left px-4 py-3 font-black">Zadnja izmjena</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-black text-slate-950">{formatPersonName(students[item.student_id]) || 'Nepoznat učenik'}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{item.subject_name}</td>
                    <td className="px-4 py-3 text-[#005c8d] font-black">{levelLabels[item.level]}</td>
                    <td className="px-4 py-3 text-slate-600">{item.exam_location || '—'}</td>
                    <td className="px-4 py-3 font-bold">{statusLabels[item.status]}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(item.updated_at || item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
