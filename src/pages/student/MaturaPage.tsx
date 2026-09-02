import React from 'react';
import { toast } from 'react-hot-toast';
import { Calendar, GraduationCap, RotateCcw, Save, Search, Send, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import {
  INSTITUTION_TYPES,
  QUOTA_TYPES,
  STUDY_AREAS,
  STUDY_FIELDS,
  STUDY_PROGRAM_CATALOG,
  STUDY_PROGRAM_CITIES,
  STUDY_PROGRAM_COMPONENTS,
  STUDY_PROGRAM_INSTITUTIONS,
  type StudyProgramOption,
  type StudyProgramRequirements,
} from '../../data/studyPrograms';

type MaturaLevel = 'A_RAZINA' | 'B_RAZINA' | 'JEDNA_RAZINA';
type MaturaStatus = 'REGISTERED' | 'CANCELED';
type MaturaTab = 'prijava' | 'odabir' | 'raspored' | 'rezultati' | 'prigovori';

type MaturaRegistration = {
  id: string;
  student_id: string;
  class_id?: string | null;
  school_id?: string | null;
  subject_name: string;
  level: MaturaLevel;
  status: MaturaStatus;
  exam_location?: string | null;
  created_at?: string;
  updated_at?: string;
};

type StudyApplication = {
  id: string;
  student_id: string;
  priority_index: number;
  name: string;
  city?: string | null;
  institution?: string | null;
  requirements?: StudyProgramRequirements | null;
  is_currently_admitted?: boolean;
};

type MaturaResult = {
  id: string;
  subject_name: string;
  level: MaturaLevel;
  status: string;
  points: number;
  max_points: number;
  percentage: number;
  grade?: string | null;
  rank?: number | null;
  participants_count?: number | null;
  percentile?: number | null;
  updated_at?: string;
};

type MaturaScheduleItem = {
  id: string;
  subject_name: string;
  level: MaturaLevel;
  exam_at: string;
  room?: string | null;
  note?: string | null;
};

type MaturaSettings = {
  objection_opens_at?: string | null;
  objection_closes_at?: string | null;
};

type StudySearchFilters = {
  institutionType: string;
  institution: string;
  component: string;
  quotaType: string;
  city: string;
  area: string;
  field: string;
  programName: string;
  institutionName: string;
};

const FOREIGN_LANGUAGE_NAMES = ['Engleski jezik', 'Njemački jezik', 'Francuski jezik', 'Talijanski jezik', 'Španjolski jezik'];
const ELECTIVE_SUBJECTS = ['Biologija', 'Povijest', 'Geografija', 'Politika i gospodarstvo', 'Fizika', 'Logika', 'Filozofija', 'Likovna umjetnost', 'Psihologija', 'Informatika', 'Kemija', 'Sociologija', 'Vjeronauk', 'Glazbena umjetnost', 'Etika'];
const MAX_ELECTIVE_REGISTRATIONS = 6;
const DEFAULT_STUDY_SEARCH_FILTERS: StudySearchFilters = {
  institutionType: '',
  institution: '',
  component: '',
  quotaType: 'Bez posebne kvote',
  city: '',
  area: '',
  field: '',
  programName: '',
  institutionName: '',
};

const levelLabels: Record<MaturaLevel, string> = {
  A_RAZINA: 'A',
  B_RAZINA: 'B',
  JEDNA_RAZINA: '-',
};

const fullLevelLabels: Record<MaturaLevel, string> = {
  A_RAZINA: 'A razina',
  B_RAZINA: 'B razina',
  JEDNA_RAZINA: 'Jedna razina',
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

const parseSchoolAddress = (value?: string) => {
  if (!value) return { address: '', city: '' };
  const trimmed = String(value).trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return { address: String(parsed.address || '').trim(), city: String(parsed.city || '').trim() };
    } catch {
      return { address: '', city: '' };
    }
  }
  return { address: trimmed, city: '' };
};

const hasOpenDeadline = (settings: MaturaSettings | null) => {
  const now = new Date();
  if (settings?.objection_opens_at && now < new Date(settings.objection_opens_at)) return false;
  if (settings?.objection_closes_at && now > new Date(settings.objection_closes_at)) return false;
  return true;
};

export default function MaturaPage() {
  const { user, isParent } = useAuth();
  const { selectedChildId, selectedClassId, selectedSchoolId } = useSelection();
  const targetStudentId = isParent ? selectedChildId : user?.id;
  const canEdit = Boolean(!isParent && targetStudentId);

  const [activeTab, setActiveTab] = React.useState<MaturaTab>('prijava');
  const [registrations, setRegistrations] = React.useState<MaturaRegistration[]>([]);
  const [studyApplications, setStudyApplications] = React.useState<StudyApplication[]>([]);
  const [results, setResults] = React.useState<MaturaResult[]>([]);
  const [schedule, setSchedule] = React.useState<MaturaScheduleItem[]>([]);
  const [settings, setSettings] = React.useState<MaturaSettings | null>(null);
  const [objections, setObjections] = React.useState<any[]>([]);
  const [foreignLanguage, setForeignLanguage] = React.useState('Engleski jezik');
  const [requiredSubject, setRequiredSubject] = React.useState('Hrvatski jezik');
  const [electiveSubject, setElectiveSubject] = React.useState('');
  const [level, setLevel] = React.useState<MaturaLevel>('B_RAZINA');
  const [schoolInfo, setSchoolInfo] = React.useState<{ name: string; address?: string; city?: string } | null>(null);
  const [objectionSubject, setObjectionSubject] = React.useState('');
  const [objectionText, setObjectionText] = React.useState('');
  const [isStudySearchOpen, setIsStudySearchOpen] = React.useState(false);
  const [studySearchFilters, setStudySearchFilters] = React.useState<StudySearchFilters>(DEFAULT_STUDY_SEARCH_FILTERS);
  const [saving, setSaving] = React.useState(false);

  const requiredSubjects = React.useMemo(() => ['Hrvatski jezik', 'Matematika', foreignLanguage], [foreignLanguage]);
  const selectedRequiredHasLevel = requiredSubject === 'Matematika' || requiredSubject === foreignLanguage;
  const parsedSchoolAddress = parseSchoolAddress(schoolInfo?.address);
  const schoolLocationLine = [parsedSchoolAddress.address, parsedSchoolAddress.city || schoolInfo?.city].filter(Boolean).join(', ');
  const examLocation = schoolInfo ? [schoolInfo.name, schoolLocationLine].filter(Boolean).join(', ') : '';
  const canSubmitObjection = canEdit && hasOpenDeadline(settings);
  const isRequiredSubject = React.useCallback((subjectName: string) => requiredSubjects.includes(subjectName), [requiredSubjects]);
  const isPassingResult = (result?: MaturaResult) => {
    if (!result?.grade) return false;
    return !/nedovoljan|\(1\)|^1$/i.test(result.grade);
  };

  const fetchAll = React.useCallback(async () => {
    if (!targetStudentId) return;
    const [registrationRes, appRes, resultRes, scheduleRes, objectionRes, settingsRes] = await Promise.all([
      fetch(`/api/matura-registrations?studentId=${targetStudentId}`),
      fetch(`/api/matura-study-applications?studentId=${targetStudentId}`),
      fetch(`/api/matura-results?studentId=${targetStudentId}&schoolId=${selectedSchoolId || ''}`),
      fetch(`/api/matura-exam-schedule?schoolId=${selectedSchoolId || ''}`),
      fetch(`/api/matura-objections?studentId=${targetStudentId}&schoolId=${selectedSchoolId || ''}`),
      fetch(`/api/matura-settings?schoolId=${selectedSchoolId || ''}`),
    ]);
    if (registrationRes.ok) setRegistrations(await registrationRes.json());
    if (appRes.ok) setStudyApplications(await appRes.json());
    if (resultRes.ok) setResults(await resultRes.json());
    if (scheduleRes.ok) setSchedule(await scheduleRes.json());
    if (objectionRes.ok) setObjections(await objectionRes.json());
    if (settingsRes.ok) setSettings(await settingsRes.json());
  }, [selectedSchoolId, targetStudentId]);

  React.useEffect(() => {
    const loadContext = async () => {
      if (selectedSchoolId) {
        const { data } = await supabase.from('schools').select('name, address, city').eq('id', selectedSchoolId).maybeSingle();
        setSchoolInfo(data || null);
      }

      if (targetStudentId && selectedClassId) {
        const { data } = await supabase
          .from('student_subject_enrollments')
          .select('subjects(name)')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId);
        const names = (data || []).map((row: any) => row.subjects?.name).filter(Boolean);
        setForeignLanguage(FOREIGN_LANGUAGE_NAMES.find(name => names.includes(name)) || 'Engleski jezik');
      }
    };
    loadContext();
  }, [selectedClassId, selectedSchoolId, targetStudentId]);

  React.useEffect(() => {
    fetchAll().catch(error => {
      console.error(error);
      toast.error('Učitavanje podataka mature nije uspjelo.');
    });
  }, [fetchAll]);

  const saveRegistration = async (subjectName: string, selectedLevel: MaturaLevel) => {
    if (!targetStudentId || !canEdit) return;
    const activeRegistrations = registrations.filter(item => item.status === 'REGISTERED');
    const electiveCount = activeRegistrations.filter(item => !isRequiredSubject(item.subject_name)).length;
    const existingRegistration = activeRegistrations.find(item => item.subject_name === subjectName);
    if (!isRequiredSubject(subjectName) && !existingRegistration && electiveCount >= MAX_ELECTIVE_REGISTRATIONS) {
      toast.error('Možete prijaviti najviše 6 izbornih ispita državne mature.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/matura-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: targetStudentId,
          class_id: selectedClassId,
          school_id: selectedSchoolId,
          subject_name: subjectName,
          level: selectedLevel,
          exam_location: examLocation,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      toast.success('Prijava mature je spremljena.');
      await fetchAll();
    } catch (error) {
      console.error(error);
      toast.error('Spremanje prijave mature nije uspjelo.');
    } finally {
      setSaving(false);
    }
  };

  const cancelRegistration = async (registration: MaturaRegistration) => {
    if (!targetStudentId || !canEdit) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/matura-registrations/${registration.id}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: targetStudentId }),
      });
      if (!response.ok) throw new Error(await response.text());
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const moveStudyApplication = async (id: string, direction: -1 | 1) => {
    const currentIndex = studyApplications.findIndex(item => item.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= studyApplications.length || !targetStudentId) return;
    const next = [...studyApplications];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
    const response = await fetch('/api/matura-study-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: targetStudentId, programs: next.map(item => ({ ...item })) }),
    });
    if (response.ok) setStudyApplications(await response.json().then(body => body.data));
  };

  const removeStudyApplication = async (id: string) => {
    if (!targetStudentId || !confirm('Jeste li sigurni da želite obrisati studijski program iz odabira?')) return;
    const next = studyApplications.filter(item => item.id !== id);
    await fetch('/api/matura-study-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: targetStudentId, programs: next }),
    });
    await fetchAll();
  };

  const addStudyApplication = async (program: StudyProgramOption) => {
    if (!targetStudentId) return;
    if (studyApplications.length >= 10) {
      toast.error('Možete odabrati najviše 10 studijskih programa.');
      return;
    }
    if (studyApplications.some(item => item.name === program.name)) {
      toast.error('Ovaj studijski program je već odabran.');
      return;
    }
    const next = [...studyApplications, {
      id: crypto.randomUUID(),
      student_id: targetStudentId,
      priority_index: studyApplications.length + 1,
      name: program.name,
      city: program.city,
      institution: program.institution,
      requirements: program.requirements,
    }];
    const response = await fetch('/api/matura-study-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: targetStudentId, programs: next }),
    });
    if (!response.ok) {
      toast.error('Studijski program nije dodan.');
      return;
    }
    setIsStudySearchOpen(false);
    setStudySearchFilters(DEFAULT_STUDY_SEARCH_FILTERS);
    await fetchAll();
  };

  const submitObjection = async () => {
    if (!targetStudentId || !objectionSubject || !objectionText.trim()) {
      toast.error('Odaberite predmet i upišite prigovor.');
      return;
    }
    const response = await fetch('/api/matura-objections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: targetStudentId,
        school_id: selectedSchoolId,
        subject_name: objectionSubject,
        text: objectionText,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error || 'Prigovor nije moguće spremiti.');
      return;
    }
    setObjectionText('');
    toast.success('Prigovor je zaprimljen.');
    await fetchAll();
  };

  const activeRegistrations = registrations.filter(item => item.status === 'REGISTERED');
  const requiredRegistrations = activeRegistrations.filter(item => isRequiredSubject(item.subject_name));
  const electiveRegistrations = activeRegistrations.filter(item => !isRequiredSubject(item.subject_name));
  const registeredBySubject = new Map(activeRegistrations.map(item => [item.subject_name, item]));
  const resultBySubject = new Map(results.map(item => [item.subject_name, item]));
  const passedResults = results.filter(item => isPassingResult(item));
  const passedBySubject = new Map(passedResults.map(item => [item.subject_name, item]));
  const objectionSubjects = results.length ? results.map(item => item.subject_name) : activeRegistrations.map(item => item.subject_name);
  const registeredRequiredSubjects = requiredSubjects.filter(subject => registeredBySubject.has(subject));
  const registeredElectiveSubjects = ELECTIVE_SUBJECTS.filter(subject => registeredBySubject.has(subject));
  const passedRequiredSubjects = requiredSubjects.filter(subject => passedBySubject.has(subject));
  const passedElectiveSubjects = ELECTIVE_SUBJECTS.filter(subject => passedBySubject.has(subject));
  const updateStudyFilter = (key: keyof StudySearchFilters, value: string) => {
    setStudySearchFilters(current => ({ ...current, [key]: value }));
  };
  const applyStudyFilters = () => setStudySearchFilters(current => ({ ...current }));
  const resetStudyFilters = () => setStudySearchFilters(DEFAULT_STUDY_SEARCH_FILTERS);
  const filteredStudyPrograms = STUDY_PROGRAM_CATALOG.filter(program => {
    const programName = studySearchFilters.programName.trim().toLowerCase();
    const institutionName = studySearchFilters.institutionName.trim().toLowerCase();
    if (studySearchFilters.institutionType && program.institutionType !== studySearchFilters.institutionType) return false;
    if (studySearchFilters.institution && program.institution !== studySearchFilters.institution) return false;
    if (studySearchFilters.component && program.component !== studySearchFilters.component) return false;
    if (studySearchFilters.quotaType && program.quotaType !== studySearchFilters.quotaType) return false;
    if (studySearchFilters.city && program.city !== studySearchFilters.city) return false;
    if (studySearchFilters.area && program.area !== studySearchFilters.area) return false;
    if (studySearchFilters.field && program.field !== studySearchFilters.field) return false;
    if (programName && !program.name.toLowerCase().includes(programName)) return false;
    if (institutionName && !`${program.institution} ${program.component}`.toLowerCase().includes(institutionName)) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-6 w-full min-h-full bg-white font-sans">
      <div className="border-b border-slate-200 pb-4 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-sm bg-[#1780c2] text-white flex items-center justify-center">
          <GraduationCap size={22} />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-950 uppercase tracking-tight">Matura</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Prijava ispita državne mature</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-5">
        {[
          ['prijava', 'Moja prijava'],
          ['odabir', 'Moj odabir'],
          ['raspored', 'Moj raspored'],
          ['rezultati', 'Moji rezultati'],
          ['prigovori', 'Moji prigovori'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as MaturaTab)}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-4 ${activeTab === id ? 'border-[#005c8d] text-[#005c8d] bg-sky-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'prijava' && (
        <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-6">
          <section className="border border-slate-200 rounded-sm bg-white shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
              <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#005c8d]">Dodaj ili promijeni prijavu</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label>Obavezni predmeti državne mature</label>
                <select value={requiredSubject} onChange={(event) => setRequiredSubject(event.target.value)} disabled={!canEdit || saving}>
                  {requiredSubjects.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              {selectedRequiredHasLevel && (
                <div>
                  <label>Razina</label>
                  <select value={level} onChange={(event) => setLevel(event.target.value as MaturaLevel)} disabled={!canEdit || saving}>
                    <option value="A_RAZINA">A razina</option>
                    <option value="B_RAZINA">B razina</option>
                  </select>
                </div>
              )}
              <button className="btn-primary w-full" disabled={!canEdit || saving} onClick={() => saveRegistration(requiredSubject, selectedRequiredHasLevel ? level : 'JEDNA_RAZINA')}>
                <Save size={14} /> Spremi obavezni ispit
              </button>

              <div className="border-t border-slate-100 pt-4">
                <label>Izborni predmeti državne mature</label>
                <select value={electiveSubject} onChange={(event) => setElectiveSubject(event.target.value)} disabled={!canEdit || saving}>
                  <option value="">-- odaberite izborni predmet --</option>
                  {ELECTIVE_SUBJECTS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <button className="btn-primary w-full" disabled={!canEdit || saving || !electiveSubject} onClick={() => saveRegistration(electiveSubject, 'JEDNA_RAZINA')}>
                <Save size={14} /> Spremi izborni ispit
              </button>

              <div>
                <label>Mjesto pisanja</label>
                <div className="border border-slate-200 bg-slate-50 rounded-sm px-3 py-2 text-sm">
                  <div className="font-black text-slate-900">{schoolInfo?.name || 'Škola nije odabrana'}</div>
                  {schoolLocationLine && <div className="text-xs font-medium text-slate-500 mt-0.5">{schoolLocationLine}</div>}
                </div>
              </div>
            </div>
          </section>

          <section className="border border-slate-200 rounded-sm bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between">
              <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#005c8d]">Prijavljeni ispiti</h2>
              <span className="text-[11px] font-black text-slate-500">{activeRegistrations.length}</span>
            </div>
            {activeRegistrations.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-slate-400 italic">Nema prijavljenih ispita državne mature.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                <RegistrationGroup title={`Obavezni ispiti (${requiredRegistrations.length}/3)`} items={requiredRegistrations} canEdit={canEdit} saving={saving} onCancel={cancelRegistration} />
                <RegistrationGroup title={`Izborni ispiti (${electiveRegistrations.length}/${MAX_ELECTIVE_REGISTRATIONS})`} items={electiveRegistrations} canEdit={canEdit} saving={saving} onCancel={cancelRegistration} />
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'odabir' && (
        <div className="grid grid-cols-1 xl:grid-cols-[480px_1fr] gap-6">
          <section className="border border-slate-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-black text-slate-700">Odabrani studijski programi ({studyApplications.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[460px] text-xs">
                <thead><tr><th>Prioritet</th><th>Naziv</th><th>Brisanje</th></tr></thead>
                <tbody>
                  {studyApplications.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-slate-500">Nema odabranih studijskih programa</td>
                    </tr>
                  )}
                  {studyApplications.map((program, index) => (
                    <tr key={program.id}>
                      <td className="w-24 align-top">
                        <button className="text-[#005c8d] mr-1" onClick={() => moveStudyApplication(program.id, -1)}>▲</button>
                        <button className="text-[#005c8d]" onClick={() => moveStudyApplication(program.id, 1)}>▼</button>
                        <span className="float-right">{program.priority_index}.</span>
                      </td>
                      <td className="text-[#1f5fa8] underline font-medium">{program.name}</td>
                      <td><button className="text-[#1f5fa8] underline" onClick={() => removeStudyApplication(program.id)}>Obriši</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsStudySearchOpen(true)}
                className="text-[#005c8d] underline font-bold text-sm disabled:text-slate-300"
                disabled={!canEdit || studyApplications.length >= 10}
              >
                Odaberi novi studijski program
              </button>
            </div>
          </section>

          <section className="space-y-6">
            <MaturaRequirementsTable
              title="Obavezni dio državne mature"
              emptyText="Nema odabranih obaveznih predmeta državne mature"
              registeredSubjects={registeredRequiredSubjects}
              passedSubjects={passedRequiredSubjects}
              registrations={registeredBySubject}
              passedResults={passedBySubject}
              studyApplications={studyApplications}
              withLevel
            />
            <MaturaRequirementsTable
              title="Izborni dio državne mature"
              emptyText="Nema odabranih izbornih predmeta državne mature"
              registeredSubjects={registeredElectiveSubjects}
              passedSubjects={passedElectiveSubjects}
              registrations={registeredBySubject}
              passedResults={passedBySubject}
              studyApplications={studyApplications}
            />
            <div className="text-xs text-[#005c8d] leading-relaxed font-medium">
              <p className="font-black mb-2 text-slate-700">Legenda:</p>
              <p>'+' - predmet je obvezan za upis</p>
              <p>'-' - predmet nije obvezan za upis</p>
              <p>'*' - jedan ili više predmeta u grupi je obvezno za upis</p>
            </div>
          </section>
        </div>
      )}

      {isStudySearchOpen && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-6xl max-h-[88vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-xl font-black italic text-[#005c8d]">Pretraživanje studijskih programa</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">Nakon što postaviš uvjete pretraživanja, klikom na “Odaberi” program se dodaje na listu prioriteta.</p>
              </div>
              <button onClick={() => setIsStudySearchOpen(false)} className="p-2 text-slate-500 hover:text-slate-900">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 border-b bg-[#f7fbfd]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <select value={studySearchFilters.institutionType} onChange={(event) => updateStudyFilter('institutionType', event.target.value)}>
                    <option value="">Sve vrste visokih učilišta</option>
                    {INSTITUTION_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={studySearchFilters.institution} onChange={(event) => updateStudyFilter('institution', event.target.value)}>
                    <option value="">Sva visoka učilišta</option>
                    {STUDY_PROGRAM_INSTITUTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={studySearchFilters.component} onChange={(event) => updateStudyFilter('component', event.target.value)}>
                    <option value="">Sve sastavnice</option>
                    {STUDY_PROGRAM_COMPONENTS.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={studySearchFilters.quotaType} onChange={(event) => updateStudyFilter('quotaType', event.target.value)}>
                    {QUOTA_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <select value={studySearchFilters.city} onChange={(event) => updateStudyFilter('city', event.target.value)}>
                    <option value="">Sva mjesta</option>
                    {STUDY_PROGRAM_CITIES.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select value={studySearchFilters.area} onChange={(event) => updateStudyFilter('area', event.target.value)}>
                      <option value="">Sva područja</option>
                      {STUDY_AREAS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select value={studySearchFilters.field} onChange={(event) => updateStudyFilter('field', event.target.value)}>
                      <option value="">Sva polja</option>
                      {STUDY_FIELDS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-[170px_1fr] gap-2 items-center">
                    <span className="text-[11px] font-bold text-[#005c8d]">Dio naziva studijskoga programa:</span>
                    <input value={studySearchFilters.programName} onChange={(event) => updateStudyFilter('programName', event.target.value)} />
                  </div>
                  <div className="grid grid-cols-[170px_1fr] gap-2 items-center">
                    <span className="text-[11px] font-bold text-[#005c8d]">Dio naziva visokoga učilišta:</span>
                    <input value={studySearchFilters.institutionName} onChange={(event) => updateStudyFilter('institutionName', event.target.value)} />
                  </div>
                </div>
              </div>
              <div className="pt-4 flex flex-wrap justify-center gap-5 text-sm">
                <button type="button" className="text-[#005c8d] underline font-black inline-flex items-center gap-2" onClick={applyStudyFilters}>
                  <Search size={14} /> Traži
                </button>
                <button type="button" className="text-[#005c8d] underline font-black" onClick={() => setIsStudySearchOpen(false)}>Odustani</button>
                <button type="button" className="text-[#005c8d] underline font-black" onClick={resetStudyFilters}>Obriši uvjete pretraživanja</button>
              </div>
            </div>
            <div className="px-4 py-2 border-b bg-white text-xs font-bold text-slate-500">
              Prikazano {filteredStudyPrograms.length} od {STUDY_PROGRAM_CATALOG.length} studijskih programa.
            </div>
            <div className="overflow-auto">
              <table className="min-w-[980px] text-sm">
                <thead><tr><th>Naziv studija</th><th>Mjesto izvođenja</th><th>Osnovne informacije</th><th>Odabir</th></tr></thead>
                <tbody>
                  {filteredStudyPrograms.map(program => (
                    <tr key={program.name}>
                      <td className="text-[#005c8d] underline font-bold">{program.name}</td>
                      <td>{program.city}</td>
                      <td>{program.institution}: {program.info}</td>
                      <td>
                        <button className="text-[#005c8d] underline font-black" onClick={() => addStudyApplication(program)}>
                          Odaberi
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredStudyPrograms.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 italic">Nema pronađenih studijskih programa.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'raspored' && (
        <section className="border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50"><h2 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Moj raspored ispita</h2></div>
          {schedule.length === 0 ? <div className="p-8 text-center text-slate-400 italic">Raspored ispita još nije objavljen.</div> : (
            <div className="divide-y">
              {schedule.map(item => (
                <div key={item.id} className="p-4 grid grid-cols-1 md:grid-cols-[1fr_120px_170px] gap-3">
                  <div className="font-black">{item.subject_name} <span className="text-[#005c8d]">{fullLevelLabels[item.level]}</span></div>
                  <div>{item.room || '-'}</div>
                  <div className="font-medium"><Calendar size={14} className="inline mr-1" />{formatDateTime(item.exam_at)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'rezultati' && (
        <section className="border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50"><h2 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Rezultati ispita državne mature</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] text-xs">
              <thead><tr><th>Ispit</th><th>Status pristupanja ispitu</th><th>Broj bodova</th><th>Najveći mogući broj bodova</th><th>Postotak riješenosti</th><th>Ocjena</th><th>Rang u generaciji</th><th>Ukupni broj pristupnika</th><th>Centil</th></tr></thead>
              <tbody>
                {results.map(item => (
                  <tr key={item.id}>
                    <td>{item.subject_name} {item.level !== 'JEDNA_RAZINA' ? `- ${levelLabels[item.level]} razina` : ''}</td>
                    <td>{item.status}</td>
                    <td>{item.points.toFixed(2)}</td>
                    <td>{item.max_points.toFixed(2)}</td>
                    <td>{item.percentage.toFixed(2)}</td>
                    <td>{item.grade || '-'}</td>
                    <td>{item.rank || '-'}</td>
                    <td>{item.participants_count || '-'}</td>
                    <td>{item.percentile || '-'}</td>
                  </tr>
                ))}
                {results.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 italic">Rezultati još nisu uneseni.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'prigovori' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <section className="border border-slate-200 bg-white shadow-sm p-4">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d] mb-4">Dodaj prigovor</h2>
            <label>Predmet</label>
            <select value={objectionSubject} onChange={(event) => setObjectionSubject(event.target.value)} disabled={!canSubmitObjection}>
              <option value="">-- odaberite predmet --</option>
              {objectionSubjects.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <label className="mt-4">Tekst prigovora</label>
            <textarea value={objectionText} onChange={(event) => setObjectionText(event.target.value)} disabled={!canSubmitObjection} rows={5} />
            <button className="btn-primary w-full mt-4" disabled={!canSubmitObjection} onClick={submitObjection}><Send size={14} /> Pošalji prigovor</button>
            <p className="text-xs text-slate-500 mt-3">Rok: {settings?.objection_opens_at ? formatDateTime(settings.objection_opens_at) : '-'} do {settings?.objection_closes_at ? formatDateTime(settings.objection_closes_at) : '-'}</p>
          </section>
          <section className="border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50"><h2 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Moji prigovori</h2></div>
            {objections.length === 0 ? <div className="p-8 text-slate-500">Nemam niti jedan prigovor.</div> : objections.map(item => (
              <div key={item.id} className="p-4 border-b">
                <div className="font-black">{item.subject_name} <span className="text-[#005c8d]">{item.status}</span></div>
                <div className="text-sm mt-1">{item.text}</div>
                <div className="text-xs text-slate-400 mt-2">{formatDateTime(item.created_at)}</div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function RegistrationGroup({ title, items, canEdit, saving, onCancel }: {
  title: string;
  items: MaturaRegistration[];
  canEdit: boolean;
  saving: boolean;
  onCancel: (registration: MaturaRegistration) => void;
}) {
  return (
    <div>
      <div className="px-4 py-2 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">{title}</div>
      {items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-slate-400 italic">Nema prijavljenih ispita u ovoj skupini.</div>
      ) : items.map(registration => (
        <div key={registration.id} className="px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_110px_150px_90px] gap-3 lg:items-center border-b border-slate-100 last:border-b-0">
          <div>
            <div className="text-sm font-black text-slate-950">{registration.subject_name}</div>
            <div className="text-xs text-slate-500 font-medium mt-1">{registration.exam_location || 'Mjesto pisanja nije uneseno'}</div>
          </div>
          <div className="text-sm font-black text-[#005c8d]">{fullLevelLabels[registration.level]}</div>
          <div className="text-xs text-slate-500 font-medium">{formatDateTime(registration.updated_at || registration.created_at)}</div>
          {canEdit && (
            <button type="button" onClick={() => onCancel(registration)} disabled={saving} className="inline-flex items-center justify-center gap-2 border border-red-200 text-red-700 hover:bg-red-50 px-3 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest">
              <RotateCcw size={13} /> Odjavi
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function MaturaRequirementsTable({ title, emptyText, registeredSubjects, passedSubjects, registrations, passedResults, studyApplications, withLevel = false }: {
  title: string;
  emptyText: string;
  registeredSubjects: string[];
  passedSubjects: string[];
  registrations: Map<string, MaturaRegistration>;
  passedResults: Map<string, MaturaResult>;
  studyApplications: StudyApplication[];
  withLevel?: boolean;
}) {
  const columns = Array.from({ length: 10 }, (_, index) => index + 1);
  const registeredRows = registeredSubjects;
  const passedRows = passedSubjects;
  const getRequiredLevel = (subject: string, columnIndex: number) => {
    const program = studyApplications[columnIndex];
    return program?.requirements?.requiredLevels?.[subject] || '-';
  };
  const getElectiveRule = (subject: string, columnIndex: number) => {
    const program = studyApplications[columnIndex];
    return program?.requirements?.electiveRules?.[subject] || '-';
  };

  return (
    <section>
      <h2 className="text-lg font-black text-slate-700 mb-3">{title}</h2>
      <div className="overflow-x-auto">
        <table className="min-w-[520px] text-xs border border-slate-200">
          <thead>
            <tr>
              <th className="border-r border-slate-200">Naziv</th>
              {withLevel && <th className="border-r border-slate-200">Razina</th>}
              {columns.map(col => <th key={col} className="text-center">{col}.</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Prijavljeni ispiti</td>
              {withLevel && <td />}
              <td colSpan={10}>Zahtjev studijskih programa</td>
            </tr>
            {registeredRows.length === 0 && (
              <tr>
                <td colSpan={withLevel ? 12 : 11} className="text-slate-500">{emptyText}</td>
              </tr>
            )}
            {registeredRows.map(subject => {
              const registration = registrations.get(subject);
              return (
                <tr key={subject}>
                  <td className="text-[#1f5fa8]">{subject}</td>
                  {withLevel && <td>{registration ? levelLabels[registration.level] : ''}</td>}
                  {columns.map((col, index) => (
                    <td key={col} className="text-center">
                      {withLevel ? getRequiredLevel(subject, index) : getElectiveRule(subject, index)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {passedRows.length > 0 && (
              <tr>
                <td>Položeni ispiti</td>
                {withLevel && <td />}
                <td colSpan={10}>Zahtjev studijskih programa</td>
              </tr>
            )}
            {passedRows.map(subject => {
              const result = passedResults.get(subject);
              return result ? (
                <tr key={`${subject}-passed`}>
                  <td className="text-[#1f5fa8]">{subject}</td>
                  {withLevel && <td>{levelLabels[result.level]}</td>}
                  {columns.map((col, index) => (
                    <td key={col} className="text-center">
                      {withLevel ? getRequiredLevel(subject, index) : getElectiveRule(subject, index)}
                    </td>
                  ))}
                </tr>
              ) : null;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
