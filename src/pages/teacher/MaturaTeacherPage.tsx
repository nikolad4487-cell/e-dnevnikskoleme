import React from 'react';
import { toast } from 'react-hot-toast';
import { Calendar, GraduationCap, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useSelection } from '../../contexts/SelectionContext';
import { supabase } from '../../lib/supabase';
import { formatPersonName } from '../../lib/utils';
import { User } from '../../types';
import { mappers } from '../../lib/mappers';

type MaturaLevel = 'A_RAZINA' | 'B_RAZINA' | 'JEDNA_RAZINA';
type MaturaStatus = 'REGISTERED' | 'CANCELED';
type TeacherMaturaTab = 'prijave' | 'rokovi' | 'raspored' | 'rezultati';

type MaturaRegistration = {
  id: string;
  student_id: string;
  subject_name: string;
  level: MaturaLevel;
  status: MaturaStatus;
  exam_location?: string | null;
  updated_at?: string;
  created_at?: string;
};

type MaturaScheduleItem = {
  id: string;
  subject_name: string;
  level: MaturaLevel;
  exam_at: string;
  room?: string | null;
  note?: string | null;
};

const SUBJECTS = ['Hrvatski jezik', 'Matematika', 'Engleski jezik', 'Njemački jezik', 'Biologija', 'Povijest', 'Geografija', 'Politika i gospodarstvo', 'Fizika', 'Logika', 'Filozofija', 'Likovna umjetnost', 'Psihologija', 'Informatika', 'Kemija', 'Sociologija', 'Vjeronauk', 'Glazbena umjetnost', 'Etika'];

const levelLabels: Record<MaturaLevel, string> = {
  A_RAZINA: 'A razina',
  B_RAZINA: 'B razina',
  JEDNA_RAZINA: 'Jedna razina',
};

const statusLabels: Record<MaturaStatus, string> = {
  REGISTERED: 'Prijavljeno',
  CANCELED: 'Odjavljeno',
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
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
  const [activeTab, setActiveTab] = React.useState<TeacherMaturaTab>('prijave');
  const [registrations, setRegistrations] = React.useState<MaturaRegistration[]>([]);
  const [students, setStudents] = React.useState<Record<string, User>>({});
  const [schedule, setSchedule] = React.useState<MaturaScheduleItem[]>([]);
  const [settings, setSettings] = React.useState<any>({});
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [resultForm, setResultForm] = React.useState({ student_id: '', subject_name: 'Matematika', level: 'B_RAZINA' as MaturaLevel, status: 'Uredno pristupanje', points: '0', max_points: '100', percentage: '0', grade: '', rank: '', participants_count: '', percentile: '' });
  const [scheduleForm, setScheduleForm] = React.useState({ subject_name: 'Hrvatski jezik', level: 'JEDNA_RAZINA' as MaturaLevel, exam_at: '', room: '', note: '' });

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSchoolId) params.set('schoolId', selectedSchoolId);
      if (selectedClassId) params.set('classId', selectedClassId);

      const [registrationsResponse, scheduleResponse, settingsResponse] = await Promise.all([
        fetch(`/api/matura-registrations?${params.toString()}`),
        fetch(`/api/matura-exam-schedule?schoolId=${selectedSchoolId || ''}`),
        fetch(`/api/matura-settings?schoolId=${selectedSchoolId || ''}`),
      ]);

      const items: MaturaRegistration[] = registrationsResponse.ok ? await registrationsResponse.json() : [];
      setRegistrations(items);
      setSchedule(scheduleResponse.ok ? await scheduleResponse.json() : []);
      setSettings(settingsResponse.ok ? ((await settingsResponse.json()) || {}) : {});

      const studentIds = [...new Set(items.map(item => item.student_id).filter(Boolean))];
      if (studentIds.length > 0) {
        const { data } = await supabase.from('user_profiles').select('*').in('id', studentIds);
        const map: Record<string, User> = {};
        (data || []).forEach(profile => {
          const user = mappers.user(profile) as User;
          map[user.id] = user;
        });
        setStudents(map);
        setResultForm(prev => ({ ...prev, student_id: prev.student_id || studentIds[0] }));
      } else {
        setStudents({});
      }
    } catch (error) {
      console.error('MATURA TEACHER LOAD ERROR', error);
      toast.error('Učitavanje mature nije uspjelo.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedSchoolId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = registrations.filter(item => {
    const studentName = formatPersonName(students[item.student_id]);
    return `${studentName} ${item.subject_name} ${item.exam_location || ''}`.toLowerCase().includes(search.trim().toLowerCase());
  });

  const saveSettings = async () => {
    const response = await fetch('/api/matura-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, school_id: selectedSchoolId }),
    });
    if (!response.ok) {
      toast.error('Rokovi nisu spremljeni.');
      return;
    }
    toast.success('Rokovi mature su spremljeni.');
    await fetchData();
  };

  const saveSchedule = async () => {
    if (!scheduleForm.exam_at) {
      toast.error('Unesite datum i vrijeme ispita.');
      return;
    }
    const response = await fetch('/api/matura-exam-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...scheduleForm, school_id: selectedSchoolId }),
    });
    if (!response.ok) {
      toast.error('Raspored nije spremljen.');
      return;
    }
    setScheduleForm({ subject_name: 'Hrvatski jezik', level: 'JEDNA_RAZINA', exam_at: '', room: '', note: '' });
    toast.success('Ispit je dodan u raspored.');
    await fetchData();
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('Jeste li sigurni da želite obrisati termin ispita?')) return;
    await fetch(`/api/matura-exam-schedule/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const saveResult = async () => {
    if (!resultForm.student_id) {
      toast.error('Odaberite učenika.');
      return;
    }
    const response = await fetch('/api/matura-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...resultForm, school_id: selectedSchoolId }),
    });
    if (!response.ok) {
      toast.error('Rezultat nije spremljen.');
      return;
    }
    toast.success('Rezultat mature je spremljen.');
  };

  return (
    <div className="p-4 md:p-6 w-full min-h-full bg-white font-sans">
      <div className="border-b border-slate-200 pb-4 mb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[#005c8d] text-white flex items-center justify-center">
            <GraduationCap size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-950 uppercase tracking-tight">Admin mature</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Prijave, rokovi, raspored i rezultati državne mature</p>
          </div>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pretraži učenika ili predmet..." className="w-full lg:w-80 pl-9" />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-5">
        {[
          ['prijave', 'Prijave učenika'],
          ['rokovi', 'Rokovi mature'],
          ['raspored', 'Raspored ispita'],
          ['rezultati', 'Unos rezultata'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id as TeacherMaturaTab)} className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-4 ${activeTab === id ? 'border-[#005c8d] text-[#005c8d] bg-sky-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'prijave' && (
        <section className="border border-slate-200 rounded-sm bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#005c8d]">Prijave učenika</h2>
            <span className="text-[11px] font-black text-slate-500">{filtered.length}</span>
          </div>
          {loading ? <div className="px-4 py-12 text-center text-sm text-slate-400 italic">Učitavanje prijava mature...</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr><th>Učenik</th><th>Predmet</th><th>Razina</th><th>Mjesto pisanja</th><th>Status</th><th>Zadnja izmjena</th></tr></thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id}>
                      <td className="font-black text-slate-950">{formatPersonName(students[item.student_id]) || 'Nepoznat učenik'}</td>
                      <td className="font-bold">{item.subject_name}</td>
                      <td className="text-[#005c8d] font-black">{levelLabels[item.level]}</td>
                      <td>{item.exam_location || '-'}</td>
                      <td>{statusLabels[item.status]}</td>
                      <td>{formatDateTime(item.updated_at || item.created_at)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 italic">Nema pronađenih prijava.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'rokovi' && (
        <section className="border border-slate-200 bg-white shadow-sm p-5 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ['registration_opens_at', 'Početak prijave ispita DM'],
              ['registration_closes_at', 'Rok prijave ispita DM'],
              ['cancellation_closes_at', 'Rok odjave ispita DM'],
              ['study_program_changes_close_at', 'Rok prijave/brisanja studijskih programa'],
              ['objection_opens_at', 'Početak prigovora na rezultate'],
              ['objection_closes_at', 'Rok prigovora na rezultate'],
            ].map(([key, label]) => (
              <div key={key}>
                <label>{label}</label>
                <input type="datetime-local" value={settings?.[key]?.slice(0, 16) || ''} onChange={(event) => setSettings((prev: any) => ({ ...prev, [key]: event.target.value }))} />
              </div>
            ))}
          </div>
          <button className="btn-primary mt-5" onClick={saveSettings}><Save size={14} /> Spremi rokove</button>
        </section>
      )}

      {activeTab === 'raspored' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <section className="border border-slate-200 bg-white shadow-sm p-4">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d] mb-4">Dodaj termin ispita</h2>
            <label>Predmet</label>
            <select value={scheduleForm.subject_name} onChange={(event) => setScheduleForm(prev => ({ ...prev, subject_name: event.target.value }))}>{SUBJECTS.map(item => <option key={item}>{item}</option>)}</select>
            <label className="mt-3">Razina</label>
            <select value={scheduleForm.level} onChange={(event) => setScheduleForm(prev => ({ ...prev, level: event.target.value as MaturaLevel }))}>
              <option value="JEDNA_RAZINA">Jedna razina</option>
              <option value="A_RAZINA">A razina</option>
              <option value="B_RAZINA">B razina</option>
            </select>
            <label className="mt-3">Datum i vrijeme</label>
            <input type="datetime-local" value={scheduleForm.exam_at} onChange={(event) => setScheduleForm(prev => ({ ...prev, exam_at: event.target.value }))} />
            <label className="mt-3">Prostorija</label>
            <input value={scheduleForm.room} onChange={(event) => setScheduleForm(prev => ({ ...prev, room: event.target.value }))} />
            <button className="btn-primary mt-4 w-full" onClick={saveSchedule}><Plus size={14} /> Dodaj termin</button>
          </section>
          <section className="border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50"><h2 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Objavljeni raspored</h2></div>
            {schedule.length === 0 ? <div className="p-8 text-slate-400 italic">Nema unesenih termina.</div> : schedule.map(item => (
              <div key={item.id} className="p-4 border-b grid grid-cols-1 md:grid-cols-[1fr_140px_170px_40px] gap-3 items-center">
                <div className="font-black">{item.subject_name} <span className="text-[#005c8d]">{levelLabels[item.level]}</span></div>
                <div>{item.room || '-'}</div>
                <div><Calendar size={14} className="inline mr-1" />{formatDateTime(item.exam_at)}</div>
                <button onClick={() => deleteSchedule(item.id)} className="text-red-600"><Trash2 size={16} /></button>
              </div>
            ))}
          </section>
        </div>
      )}

      {activeTab === 'rezultati' && (
        <section className="border border-slate-200 bg-white shadow-sm p-5 max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label>Učenik</label><select value={resultForm.student_id} onChange={(event) => setResultForm(prev => ({ ...prev, student_id: event.target.value }))}>{Object.values(students).map(student => <option key={student.id} value={student.id}>{formatPersonName(student)}</option>)}</select></div>
            <div><label>Ispit</label><select value={resultForm.subject_name} onChange={(event) => setResultForm(prev => ({ ...prev, subject_name: event.target.value }))}>{SUBJECTS.map(item => <option key={item}>{item}</option>)}</select></div>
            <div><label>Razina</label><select value={resultForm.level} onChange={(event) => setResultForm(prev => ({ ...prev, level: event.target.value as MaturaLevel }))}><option value="JEDNA_RAZINA">Jedna razina</option><option value="A_RAZINA">A razina</option><option value="B_RAZINA">B razina</option></select></div>
            <div><label>Status pristupanja</label><input value={resultForm.status} onChange={(event) => setResultForm(prev => ({ ...prev, status: event.target.value }))} /></div>
            <div><label>Broj bodova</label><input type="number" value={resultForm.points} onChange={(event) => setResultForm(prev => ({ ...prev, points: event.target.value }))} /></div>
            <div><label>Najveći mogući broj bodova</label><input type="number" value={resultForm.max_points} onChange={(event) => setResultForm(prev => ({ ...prev, max_points: event.target.value }))} /></div>
            <div><label>Postotak riješenosti</label><input type="number" value={resultForm.percentage} onChange={(event) => setResultForm(prev => ({ ...prev, percentage: event.target.value }))} /></div>
            <div><label>Ocjena</label><input value={resultForm.grade} onChange={(event) => setResultForm(prev => ({ ...prev, grade: event.target.value }))} placeholder="npr. Dovoljan (2)" /></div>
            <div><label>Rang u generaciji</label><input type="number" value={resultForm.rank} onChange={(event) => setResultForm(prev => ({ ...prev, rank: event.target.value }))} /></div>
            <div><label>Ukupni broj pristupnika</label><input type="number" value={resultForm.participants_count} onChange={(event) => setResultForm(prev => ({ ...prev, participants_count: event.target.value }))} /></div>
            <div><label>Centil</label><input type="number" value={resultForm.percentile} onChange={(event) => setResultForm(prev => ({ ...prev, percentile: event.target.value }))} /></div>
          </div>
          <button className="btn-primary mt-5" onClick={saveResult}><Save size={14} /> Spremi rezultat</button>
        </section>
      )}
    </div>
  );
}
