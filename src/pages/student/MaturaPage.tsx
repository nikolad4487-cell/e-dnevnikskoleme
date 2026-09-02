import React from 'react';
import { toast } from 'react-hot-toast';
import { GraduationCap, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';

type MaturaLevel = 'A_RAZINA' | 'B_RAZINA' | 'JEDNA_RAZINA';
type MaturaStatus = 'REGISTERED' | 'CANCELED';

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

const MATURA_SUBJECTS = [
  { name: 'Hrvatski jezik', hasLevels: false },
  { name: 'Matematika', hasLevels: true },
  { name: 'Engleski jezik', hasLevels: true },
  { name: 'Njemački jezik', hasLevels: true },
  { name: 'Francuski jezik', hasLevels: true },
  { name: 'Španjolski jezik', hasLevels: true },
  { name: 'Talijanski jezik', hasLevels: true },
  { name: 'Latinski jezik', hasLevels: true },
  { name: 'Češki jezik', hasLevels: false },
  { name: 'Mađarski jezik i književnost', hasLevels: false },
  { name: 'Srpski jezik', hasLevels: false },
  { name: 'Grčki jezik', hasLevels: false },
  { name: 'Filozofija', hasLevels: false },
  { name: 'Glazbena umjetnost', hasLevels: false },
  { name: 'Kemija', hasLevels: false },
  { name: 'Psihologija', hasLevels: false },
  { name: 'Fizika', hasLevels: false },
  { name: 'Likovna umjetnost', hasLevels: false },
  { name: 'Logika', hasLevels: false },
  { name: 'Sociologija', hasLevels: false },
  { name: 'Biologija', hasLevels: false },
  { name: 'Povijest', hasLevels: false },
  { name: 'Informatika', hasLevels: false },
  { name: 'Politika i gospodarstvo', hasLevels: false },
  { name: 'Geografija', hasLevels: false },
  { name: 'Vjeronauk', hasLevels: false },
  { name: 'Etika', hasLevels: false },
] as const;

const levelLabels: Record<MaturaLevel, string> = {
  A_RAZINA: 'Viša razina',
  B_RAZINA: 'Osnovna razina',
  JEDNA_RAZINA: 'Jedna razina',
};

const statusLabels: Record<MaturaStatus, string> = {
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

export default function MaturaPage() {
  const { user, isParent } = useAuth();
  const { selectedChildId, selectedClassId, selectedSchoolId } = useSelection();
  const targetStudentId = isParent ? selectedChildId : user?.id;
  const canEdit = Boolean(!isParent && targetStudentId);

  const [registrations, setRegistrations] = React.useState<MaturaRegistration[]>([]);
  const [subject, setSubject] = React.useState<string>(MATURA_SUBJECTS[0].name);
  const [level, setLevel] = React.useState<MaturaLevel>('A_RAZINA');
  const [schoolInfo, setSchoolInfo] = React.useState<{ name: string; address?: string; city?: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const selectedSubjectConfig = MATURA_SUBJECTS.find(item => item.name === subject) || MATURA_SUBJECTS[0];
  const effectiveLevel: MaturaLevel = selectedSubjectConfig.hasLevels ? level : 'JEDNA_RAZINA';
  const examLocation = schoolInfo
    ? [schoolInfo.name, schoolInfo.address, schoolInfo.city].filter(Boolean).join(', ')
    : '';

  React.useEffect(() => {
    if (!selectedSubjectConfig.hasLevels) {
      setLevel('A_RAZINA');
    }
  }, [selectedSubjectConfig.hasLevels]);

  React.useEffect(() => {
    const fetchSchoolInfo = async () => {
      if (!selectedSchoolId) {
        setSchoolInfo(null);
        return;
      }

      const { data, error } = await supabase
        .from('schools')
        .select('name, address, city')
        .eq('id', selectedSchoolId)
        .maybeSingle();

      if (error) {
        console.error('MATURA SCHOOL LOAD ERROR', error);
        setSchoolInfo(null);
        return;
      }

      setSchoolInfo(data || null);
    };

    fetchSchoolInfo();
  }, [selectedSchoolId]);

  const fetchRegistrations = React.useCallback(async () => {
    if (!targetStudentId) return;

    try {
      const response = await fetch(`/api/matura-registrations?studentId=${targetStudentId}`);
      if (!response.ok) throw new Error('Fetch failed');
      setRegistrations(await response.json());
    } catch (error) {
      console.error(error);
      toast.error('Učitavanje prijava mature nije uspjelo.');
    }
  }, [targetStudentId]);

  React.useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetStudentId || !canEdit) return;

    setSaving(true);
    try {
      const response = await fetch('/api/matura-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: targetStudentId,
          class_id: selectedClassId,
          school_id: selectedSchoolId,
          subject_name: subject,
          level: effectiveLevel,
          exam_location: examLocation,
        }),
      });

      if (!response.ok) throw new Error('Save failed');
      toast.success('Prijava mature je spremljena.');
      await fetchRegistrations();
    } catch (error) {
      console.error(error);
      toast.error('Spremanje prijave mature nije uspjelo.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (registration: MaturaRegistration) => {
    if (!targetStudentId || !canEdit) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/matura-registrations/${registration.id}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: targetStudentId }),
      });

      if (!response.ok) throw new Error('Cancel failed');
      toast.success('Prijava mature je odjavljena.');
      await fetchRegistrations();
    } catch (error) {
      console.error(error);
      toast.error('Odjava mature nije uspjela.');
    } finally {
      setSaving(false);
    }
  };

  const activeRegistrations = registrations.filter(item => item.status === 'REGISTERED');
  const canceledRegistrations = registrations.filter(item => item.status === 'CANCELED');

  return (
    <div className="p-4 md:p-6 w-full min-h-full bg-white font-sans">
      <div className="border-b border-slate-200 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[#1780c2] text-white flex items-center justify-center">
            <GraduationCap size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-950 uppercase tracking-tight">Matura</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Prijava ispita državne mature</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        <section className="border border-slate-200 rounded-sm bg-white shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#005c8d]">Dodaj ili promijeni prijavu</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Predmet</label>
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                disabled={!canEdit || saving}
                className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#1780c2]/20 disabled:bg-slate-50"
              >
                {MATURA_SUBJECTS.map(item => (
                  <option key={item.name} value={item.name}>{item.name}</option>
                ))}
              </select>
            </div>

            {selectedSubjectConfig.hasLevels && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Razina</label>
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value as MaturaLevel)}
                  disabled={!canEdit || saving}
                  className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#1780c2]/20 disabled:bg-slate-50"
                >
                  <option value="A_RAZINA">Viša razina</option>
                  <option value="B_RAZINA">Osnovna razina</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Mjesto pisanja</label>
              <div className="border border-slate-200 bg-slate-50 rounded-sm px-3 py-2 text-sm text-slate-700 min-h-[42px]">
                <div className="font-black text-slate-900">{schoolInfo?.name || 'Škola nije odabrana'}</div>
                {(schoolInfo?.address || schoolInfo?.city) && (
                  <div className="text-xs font-medium text-slate-500 mt-0.5">
                    {[schoolInfo?.address, schoolInfo?.city].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={!canEdit || saving}
              className="w-full bg-[#005c8d] hover:bg-[#004a70] disabled:bg-slate-300 text-white px-4 py-2.5 rounded-sm text-[11px] font-black uppercase tracking-widest transition-colors"
            >
              Spremi prijavu
            </button>

            {isParent && (
              <p className="text-xs text-slate-500 font-medium">
                Roditelj ima uvid u prijave mature, a prijavu i promjenu razine radi učenik.
              </p>
            )}
          </form>
        </section>

        <section className="border border-slate-200 rounded-sm bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#005c8d]">Prijavljeni ispiti</h2>
            <span className="text-[11px] font-black text-slate-500">{activeRegistrations.length}</span>
          </div>

          {activeRegistrations.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-400 italic">
              Nema prijavljenih ispita državne mature.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeRegistrations.map(registration => (
                <div key={registration.id} className="px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_140px_170px_100px] gap-3 lg:items-center">
                  <div>
                    <div className="text-sm font-black text-slate-950">{registration.subject_name}</div>
                    <div className="text-xs text-slate-500 font-medium mt-1">{registration.exam_location || 'Mjesto pisanja nije uneseno'}</div>
                  </div>
                  <div className="text-sm font-black text-[#005c8d]">{levelLabels[registration.level]}</div>
                  <div className="text-xs text-slate-500 font-medium">
                    <div>{statusLabels[registration.status]}</div>
                    <div>{formatDateTime(registration.updated_at || registration.created_at)}</div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleCancel(registration)}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest"
                    >
                      <RotateCcw size={13} />
                      Odjavi
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {canceledRegistrations.length > 0 && (
        <section className="mt-6 border border-slate-200 rounded-sm bg-white shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Odjavljeni ispiti</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {canceledRegistrations.map(registration => (
              <div key={registration.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-[1fr_130px_170px] gap-3 text-sm text-slate-500">
                <span className="font-bold">{registration.subject_name}</span>
                <span>{levelLabels[registration.level]}</span>
                <span>{formatDateTime(registration.updated_at || registration.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
