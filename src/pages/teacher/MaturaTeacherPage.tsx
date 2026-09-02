import React from 'react';
import { toast } from 'react-hot-toast';
import { Calendar, GraduationCap, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { supabase } from '../../lib/supabase';
import { formatPersonName } from '../../lib/utils';
import { User } from '../../types';
import { mappers } from '../../lib/mappers';

type MaturaLevel = 'A_RAZINA' | 'B_RAZINA' | 'JEDNA_RAZINA';
type MaturaStatus = 'REGISTERED' | 'CANCELED';
type TeacherMaturaTab = 'prijave' | 'rokovi' | 'raspored' | 'rezultati' | 'studiji';

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

type StudyRequirement = {
  subject_name: string;
  level?: 'A' | 'B' | '-';
  threshold?: string;
  weight?: string;
  is_required?: boolean;
};

type MaturaStudyProgram = {
  id: string;
  faculty: string;
  component?: string | null;
  study_name: string;
  city: string;
  institution_type: string;
  area?: string | null;
  field?: string | null;
  quota_type: string;
  admission_round: string;
  is_active: boolean;
  citizen_quota: number;
  foreign_quota: number;
  school_gpa_weight: number;
  required_exams: StudyRequirement[];
  elective_exams: StudyRequirement[];
  special_achievements: Array<{ description: string; value: string; direct_admission?: boolean }>;
  health_considerations: Array<{ description: string; value: string; direct_admission?: boolean }>;
};

const SUBJECTS = ['Hrvatski jezik', 'Matematika', 'Engleski jezik', 'Njemački jezik', 'Biologija', 'Povijest', 'Geografija', 'Politika i gospodarstvo', 'Fizika', 'Logika', 'Filozofija', 'Likovna umjetnost', 'Psihologija', 'Informatika', 'Kemija', 'Sociologija', 'Vjeronauk', 'Glazbena umjetnost', 'Etika'];
const REQUIRED_MATURA_SUBJECTS = ['Hrvatski jezik', 'Matematika', 'Strani jezik'];
const ELECTIVE_MATURA_SUBJECTS = SUBJECTS.filter(subject => !['Hrvatski jezik', 'Matematika', 'Engleski jezik', 'Njemački jezik'].includes(subject));
const INSTITUTION_TYPES = ['Javna sveučilišta', 'Javna veleučilišta', 'Javne visoke škole', 'Privatna sveučilišta', 'Privatna veleučilišta', 'Privatne visoke škole'];
const STUDY_AREAS = ['Arhitektura', 'Biomedicina i zdravstvo', 'Biotehničke znanosti', 'Dizajn', 'Društvene znanosti', 'Humanističke znanosti', 'Prirodne znanosti', 'Tehničke znanosti'];
const STUDY_FIELDS = ['Arhitektura i urbanizam', 'Ekonomija', 'Elektrotehnika', 'Filologija', 'Građevinarstvo', 'Informacijske i komunikacijske znanosti', 'Medicina', 'Pedagogija', 'Pravo', 'Psihologija', 'Računarstvo', 'Strojarstvo', 'Tehnologija prometa i transport'];

const emptyStudyProgramForm = (): Omit<MaturaStudyProgram, 'id'> & { id?: string } => ({
  faculty: '',
  component: '',
  study_name: '',
  city: '',
  institution_type: 'Javna sveučilišta',
  area: 'Društvene znanosti',
  field: 'Pedagogija',
  quota_type: 'Bez posebne kvote',
  admission_round: 'LJETNI',
  is_active: true,
  citizen_quota: 0,
  foreign_quota: 0,
  school_gpa_weight: 30,
  required_exams: REQUIRED_MATURA_SUBJECTS.map(subject => ({ subject_name: subject, level: subject === 'Hrvatski jezik' ? '-' : 'B', threshold: '', weight: subject === 'Hrvatski jezik' ? '30' : subject === 'Matematika' ? '25' : '10', is_required: true })),
  elective_exams: [],
  special_achievements: [],
  health_considerations: [],
});

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
  const { user } = useAuth();
  const { selectedClassId, selectedSchoolId } = useSelection();
  const [activeTab, setActiveTab] = React.useState<TeacherMaturaTab>('prijave');
  const [registrations, setRegistrations] = React.useState<MaturaRegistration[]>([]);
  const [students, setStudents] = React.useState<Record<string, User>>({});
  const [schedule, setSchedule] = React.useState<MaturaScheduleItem[]>([]);
  const [studyPrograms, setStudyPrograms] = React.useState<MaturaStudyProgram[]>([]);
  const [settings, setSettings] = React.useState<any>({});
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [resultForm, setResultForm] = React.useState({ student_id: '', subject_name: 'Matematika', level: 'B_RAZINA' as MaturaLevel, status: 'Uredno pristupanje', points: '0', max_points: '100', percentage: '0', grade: '', rank: '', participants_count: '', percentile: '' });
  const [scheduleForm, setScheduleForm] = React.useState({ subject_name: 'Hrvatski jezik', level: 'JEDNA_RAZINA' as MaturaLevel, exam_at: '', room: '', note: '' });
  const [studyForm, setStudyForm] = React.useState(emptyStudyProgramForm);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSchoolId) params.set('schoolId', selectedSchoolId);
      if (selectedClassId) params.set('classId', selectedClassId);

      const [registrationsResponse, scheduleResponse, settingsResponse, studyProgramsResponse] = await Promise.all([
        fetch(`/api/matura-registrations?${params.toString()}`),
        fetch(`/api/matura-exam-schedule?schoolId=${selectedSchoolId || ''}`),
        fetch(`/api/matura-settings?schoolId=${selectedSchoolId || ''}`),
        fetch(`/api/matura-study-programs?activeOnly=false${selectedSchoolId ? `&schoolId=${selectedSchoolId}` : ''}`),
      ]);

      const items: MaturaRegistration[] = registrationsResponse.ok ? await registrationsResponse.json() : [];
      setRegistrations(items);
      setSchedule(scheduleResponse.ok ? await scheduleResponse.json() : []);
      setSettings(settingsResponse.ok ? ((await settingsResponse.json()) || {}) : {});
      setStudyPrograms(studyProgramsResponse.ok ? await studyProgramsResponse.json() : []);

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

  const saveStudyProgram = async () => {
    if (!studyForm.faculty.trim() || !studyForm.study_name.trim() || !studyForm.city.trim()) {
      toast.error('Unesite fakultet, studij i mjesto izvođenja.');
      return;
    }
    const response = await fetch('/api/matura-study-programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...studyForm,
        school_id: selectedSchoolId,
        created_by: user?.id,
        updated_by: user?.id,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error || 'Studijski program nije spremljen.');
      return;
    }
    toast.success('Studijski program je spremljen.');
    setStudyForm(emptyStudyProgramForm());
    await fetchData();
  };

  const editStudyProgram = (program: MaturaStudyProgram) => {
    setStudyForm({
      ...emptyStudyProgramForm(),
      ...program,
      required_exams: program.required_exams?.length ? program.required_exams : emptyStudyProgramForm().required_exams,
      elective_exams: program.elective_exams || [],
      special_achievements: program.special_achievements || [],
      health_considerations: program.health_considerations || [],
    });
    setActiveTab('studiji');
  };

  const deleteStudyProgram = async (id: string) => {
    if (!confirm('Jeste li sigurni da želite obrisati otvoreni studijski program?')) return;
    await fetch(`/api/matura-study-programs/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const updateRequiredExam = (index: number, updates: Partial<StudyRequirement>) => {
    setStudyForm(prev => ({ ...prev, required_exams: prev.required_exams.map((item, i) => i === index ? { ...item, ...updates } : item) }));
  };

  const updateElectiveExam = (index: number, updates: Partial<StudyRequirement>) => {
    setStudyForm(prev => ({ ...prev, elective_exams: prev.elective_exams.map((item, i) => i === index ? { ...item, ...updates } : item) }));
  };

  const addElectiveExam = () => {
    setStudyForm(prev => ({ ...prev, elective_exams: [...prev.elective_exams, { subject_name: 'Biologija', is_required: false, weight: '0', threshold: '' }] }));
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
          ['studiji', 'Studijski programi'],
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

      {activeTab === 'studiji' && (
        <div className="grid grid-cols-1 xl:grid-cols-[460px_1fr] gap-6">
          <section className="border border-slate-200 bg-white shadow-sm p-5">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d] mb-4">Otvori studijski program za upis</h2>
            <div className="grid grid-cols-1 gap-3">
              <div><label>Fakultet / visoko učilište</label><input value={studyForm.faculty} onChange={(event) => setStudyForm(prev => ({ ...prev, faculty: event.target.value }))} placeholder="npr. Sveučilište u Zagrebu" /></div>
              <div><label>Sastavnica</label><input value={studyForm.component || ''} onChange={(event) => setStudyForm(prev => ({ ...prev, component: event.target.value }))} placeholder="npr. Učiteljski fakultet Sveučilišta u Zagrebu" /></div>
              <div><label>Studij</label><input value={studyForm.study_name} onChange={(event) => setStudyForm(prev => ({ ...prev, study_name: event.target.value }))} placeholder="npr. Učiteljski studij" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label>Mjesto izvođenja</label><input value={studyForm.city} onChange={(event) => setStudyForm(prev => ({ ...prev, city: event.target.value }))} placeholder="Zagreb" /></div>
                <div><label>Rok</label><select value={studyForm.admission_round} onChange={(event) => setStudyForm(prev => ({ ...prev, admission_round: event.target.value }))}><option value="LJETNI">Ljetni rok</option><option value="JESENSKI">Jesenski rok</option><option value="POSEBNI">Posebni rok</option></select></div>
              </div>
              <div><label>Vrsta visokog učilišta</label><select value={studyForm.institution_type} onChange={(event) => setStudyForm(prev => ({ ...prev, institution_type: event.target.value }))}>{INSTITUTION_TYPES.map(item => <option key={item}>{item}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label>Područje</label><select value={studyForm.area || ''} onChange={(event) => setStudyForm(prev => ({ ...prev, area: event.target.value }))}>{STUDY_AREAS.map(item => <option key={item}>{item}</option>)}</select></div>
                <div><label>Polje</label><select value={studyForm.field || ''} onChange={(event) => setStudyForm(prev => ({ ...prev, field: event.target.value }))}>{STUDY_FIELDS.map(item => <option key={item}>{item}</option>)}</select></div>
              </div>
              <div><label>Posebna kvota</label><input value={studyForm.quota_type} onChange={(event) => setStudyForm(prev => ({ ...prev, quota_type: event.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label>Mjesta RH</label><input type="number" value={studyForm.citizen_quota} onChange={(event) => setStudyForm(prev => ({ ...prev, citizen_quota: Number(event.target.value) }))} /></div>
                <div><label>Mjesta stranci</label><input type="number" value={studyForm.foreign_quota} onChange={(event) => setStudyForm(prev => ({ ...prev, foreign_quota: Number(event.target.value) }))} /></div>
                <div><label>Ocjene škole %</label><input type="number" value={studyForm.school_gpa_weight} onChange={(event) => setStudyForm(prev => ({ ...prev, school_gpa_weight: Number(event.target.value) }))} /></div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={studyForm.is_active} onChange={(event) => setStudyForm(prev => ({ ...prev, is_active: event.target.checked }))} className="w-auto" />
                Program je otvoren učenicima
              </label>
            </div>

            <h3 className="mt-6 mb-2 text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Obavezni ispiti mature</h3>
            <div className="space-y-2">
              {studyForm.required_exams.map((exam, index) => (
                <div key={exam.subject_name} className="grid grid-cols-[1fr_76px_76px] gap-2">
                  <input value={exam.subject_name} onChange={(event) => updateRequiredExam(index, { subject_name: event.target.value })} />
                  <select value={exam.level || '-'} onChange={(event) => updateRequiredExam(index, { level: event.target.value as 'A' | 'B' | '-' })}><option value="-">Nema</option><option value="A">A</option><option value="B">B</option></select>
                  <input type="number" value={exam.weight || ''} onChange={(event) => updateRequiredExam(index, { weight: event.target.value })} placeholder="%" />
                </div>
              ))}
            </div>

            <h3 className="mt-6 mb-2 text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Izborni ispiti mature</h3>
            <div className="space-y-2">
              {studyForm.elective_exams.map((exam, index) => (
                <div key={`${exam.subject_name}-${index}`} className="grid grid-cols-[1fr_82px_70px_28px] gap-2 items-center">
                  <select value={exam.subject_name} onChange={(event) => updateElectiveExam(index, { subject_name: event.target.value })}>{ELECTIVE_MATURA_SUBJECTS.map(item => <option key={item}>{item}</option>)}</select>
                  <label className="inline-flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={Boolean(exam.is_required)} onChange={(event) => updateElectiveExam(index, { is_required: event.target.checked })} className="w-auto" /> obv.</label>
                  <input type="number" value={exam.weight || ''} onChange={(event) => updateElectiveExam(index, { weight: event.target.value })} placeholder="%" />
                  <button type="button" className="text-red-600" onClick={() => setStudyForm(prev => ({ ...prev, elective_exams: prev.elective_exams.filter((_, i) => i !== index) }))}><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" className="text-[#005c8d] underline font-bold text-sm" onClick={addElectiveExam}>+ Dodaj izborni ispit</button>
            </div>

            <h3 className="mt-6 mb-2 text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Posebna postignuća i zdravstvene tegobe</h3>
            <textarea rows={3} value={studyForm.special_achievements.map(item => item.description).join('\n')} onChange={(event) => setStudyForm(prev => ({ ...prev, special_achievements: event.target.value.split('\n').filter(Boolean).map(description => ({ description, value: '5', direct_admission: false })) }))} placeholder="Svaki red je jedno posebno postignuće..." />
            <textarea rows={3} className="mt-2" value={studyForm.health_considerations.map(item => item.description).join('\n')} onChange={(event) => setStudyForm(prev => ({ ...prev, health_considerations: event.target.value.split('\n').filter(Boolean).map(description => ({ description, value: '5', direct_admission: false })) }))} placeholder="Svaki red je jedna zdravstvena tegoba/uvjet..." />

            <div className="flex gap-2 mt-5">
              <button className="btn-primary" onClick={saveStudyProgram}><Save size={14} /> Spremi program</button>
              <button className="px-4 py-2 border border-slate-200 text-xs font-black uppercase" onClick={() => setStudyForm(emptyStudyProgramForm())}>Očisti</button>
            </div>
          </section>

          <section className="border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 flex justify-between">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Otvoreni studijski programi</h2>
              <span className="text-[11px] font-black text-slate-500">{studyPrograms.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] text-xs">
                <thead><tr><th>Fakultet</th><th>Studij</th><th>Rok</th><th>Kvote</th><th>Obavezni ispiti</th><th>Izborni ispiti</th><th>Akcije</th></tr></thead>
                <tbody>
                  {studyPrograms.map(program => (
                    <tr key={program.id}>
                      <td><div className="font-black">{program.faculty}</div><div className="text-slate-500">{program.component}</div></td>
                      <td><div className="font-bold text-[#005c8d]">{program.study_name}</div><div>{program.city} · {program.institution_type}</div></td>
                      <td>{program.admission_round}<br />{program.is_active ? 'Otvoren' : 'Zatvoren'}</td>
                      <td>RH {program.citizen_quota}<br />Stranci {program.foreign_quota}</td>
                      <td>{(program.required_exams || []).map(exam => `${exam.subject_name} ${exam.level || '-'}`).join(', ') || '-'}</td>
                      <td>{(program.elective_exams || []).map(exam => `${exam.subject_name} ${exam.is_required ? '+' : '-'} ${exam.weight || 0}%`).join(', ') || 'Nije zahtjev studija'}</td>
                      <td>
                        <button className="text-[#005c8d] underline font-bold mr-3" onClick={() => editStudyProgram(program)}>Uredi</button>
                        <button className="text-red-600 underline font-bold" onClick={() => deleteStudyProgram(program.id)}>Obriši</button>
                      </td>
                    </tr>
                  ))}
                  {studyPrograms.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 italic">Nema otvorenih studijskih programa. Admin fakulteta ih mora unijeti.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
