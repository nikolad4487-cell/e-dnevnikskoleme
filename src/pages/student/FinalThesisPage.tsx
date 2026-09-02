import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { Ban } from 'lucide-react';
import { ThesisApplication } from '../../types';
import { isClassEligibleForFinalThesis } from '../../lib/thesisHelper';

type ThesisFormState = {
  title: string;
  mentorId: string;
  examTerm: string;
  studentNote: string;
};

const emptyForm: ThesisFormState = {
  title: '',
  mentorId: '',
  examTerm: '',
  studentNote: '',
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hr-HR');
};

export default function FinalThesisPage() {
  const { user, isParent } = useAuth();
  const { selectedChildId, selectedClassId, selectedSchoolId } = useSelection();
  const studentId = isParent ? selectedChildId : user?.id;

  const [applications, setApplications] = useState<ThesisApplication[]>([]);
  const [mentors, setMentors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAccessible, setIsAccessible] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPastApplications, setShowPastApplications] = useState(false);
  const [deregisterNote, setDeregisterNote] = useState('');
  const [form, setForm] = useState<ThesisFormState>(emptyForm);

  const sortedApplications = useMemo(
    () => [...applications].sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || ''))),
    [applications]
  );

  const activeApp = sortedApplications.find(app => app.status === 'CREATED' || app.status === 'ACCEPTED' || app.status === 'COMPLETED');
  const latestDeregistered = sortedApplications.find(app => app.status === 'DEREGISTERED');
  const pastApplications = sortedApplications.filter(app => app.id !== activeApp?.id);
  const isAccepted = activeApp?.status === 'ACCEPTED' || activeApp?.status === 'COMPLETED';
  const isRegistered = Boolean(activeApp?.application_classification_number || activeApp?.application_registry_number);

  const mentorName = (mentorId?: string) => mentors.find(m => m.id === mentorId)?.name || '—';

  useEffect(() => {
    if (!studentId) return;

    const checkAccess = async () => {
      const { data: enrollment } = await supabase
        .from('student_class_enrollments')
        .select('classes:class_id(name, grade_level, programs:program_id(duration_years))')
        .eq('student_id', studentId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      const clazz = enrollment?.classes as any;
      setIsAccessible(isClassEligibleForFinalThesis(clazz));
    };

    checkAccess();
  }, [studentId]);

  const fetchAppData = async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const { data: mentorsData } = await supabase
        .from('user_profiles')
        .select('id, name, role')
        .in('role', ['TEACHER', 'HOMEROOM', 'ADMIN', 'SCHOOL_ADMIN']);
      setMentors(mentorsData || []);

      const response = await fetch(`/api/final-thesis?studentId=${studentId}`);
      if (response.ok) {
        setApplications(await response.json());
      } else {
        const { data } = await supabase
          .from('final_thesis')
          .select('*')
          .eq('student_id', studentId)
          .order('submitted_at', { ascending: false });
        setApplications((data || []) as any[]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Greška pri učitavanju završnih radova.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAccessible) fetchAppData();
  }, [studentId, isAccessible]);

  useEffect(() => {
    if (activeApp?.status === 'CREATED') {
      setForm({
        title: activeApp.thesis_title || '',
        mentorId: activeApp.mentor_id || '',
        examTerm: activeApp.exam_period || '',
        studentNote: activeApp.student_note || '',
      });
      setShowCreateForm(false);
    } else if (!activeApp) {
      setForm(emptyForm);
      setShowCreateForm(true);
    }
  }, [activeApp?.id, activeApp?.status]);

  const resetForm = () => {
    setForm(emptyForm);
    setShowCreateForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    if (!form.title.trim() || !form.mentorId || !form.examTerm) {
      toast.error('Molimo popunite naziv rada, rok i mentora.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        student_id: studentId,
        class_id: selectedClassId || activeApp?.class_id || 'N/A',
        school_id: selectedSchoolId || activeApp?.school_id || 'N/A',
        thesis_title: form.title.trim(),
        mentor_id: form.mentorId,
        exam_period: form.examTerm,
        student_note: form.studentNote.trim(),
        status: 'CREATED',
      };

      const response = await fetch(activeApp?.status === 'CREATED' ? `/api/final-thesis/${activeApp.id}` : '/api/final-thesis', {
        method: activeApp?.status === 'CREATED' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Save failed');

      toast.success(activeApp?.status === 'CREATED' ? 'Prijava je spremljena.' : 'Završni rad je prijavljen.');
      setShowCreateForm(false);
      await fetchAppData();
    } catch (err) {
      console.error(err);
      toast.error('Spremanje prijave nije uspjelo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeApp || activeApp.status !== 'CREATED') return;
    if (!window.confirm('Želite li trajno izbrisati ovu prijavu završnog rada?')) return;

    try {
      const response = await fetch(`/api/final-thesis/${activeApp.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      toast.success('Prijava je izbrisana.');
      resetForm();
      await fetchAppData();
    } catch (err) {
      console.error(err);
      toast.error('Brisanje prijave nije uspjelo.');
    }
  };

  const handleDeregister = async () => {
    if (!activeApp) return;

    try {
      const response = await fetch(`/api/final-thesis/${activeApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DEREGISTERED',
          deregistration_note: deregisterNote.trim(),
          deregistered_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error('Deregister failed');
      toast.success('Završni rad je odjavljen.');
      setDeregisterNote('');
      resetForm();
      await fetchAppData();
    } catch (err) {
      console.error(err);
      toast.error('Odjava završnog rada nije uspjela.');
    }
  };

  if (loading || isAccessible === null) {
    return <div className="p-8 text-gray-500">Učitavanje podataka o završnom radu...</div>;
  }

  if (!isAccessible) {
    return (
      <div className="p-8 flex flex-col items-center justify-center font-sans text-gray-500 space-y-4">
        <Ban size={48} className="text-amber-500" />
        <p className="text-center text-lg font-bold">Završni rad dostupan je samo učenicima završnih razreda.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 w-full min-h-full bg-white font-sans">
      <div className="flex items-center justify-between gap-4 mb-10">
        <h1 className="text-lg font-normal text-slate-950">
          {showCreateForm || activeApp?.status === 'CREATED' || latestDeregistered ? 'PRIJAVA ZAVRŠNOG RADA' : 'ZAVRŠNI RAD'}
        </h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPastApplications(prev => !prev)}
            className="bg-[#0784d3] text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Prošle prijave
          </button>
          {!showCreateForm && !activeApp && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-[#0784d3] text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Kreiraj novi
            </button>
          )}
        </div>
      </div>

      {showPastApplications && (
        <div className="mb-8 space-y-2">
          <h2 className="text-base font-normal text-slate-950">PROŠLE PRIJAVE</h2>
          {pastApplications.length === 0 ? (
            <div className="rounded-md border border-slate-100 bg-white p-3 text-sm text-slate-500 shadow-sm">Nema prošlih prijava.</div>
          ) : (
            pastApplications.map(app => (
              <div key={app.id} className="rounded-md border border-slate-100 bg-white p-3 text-sm shadow-sm">
                <div className="font-bold">Naslov - {app.thesis_title}</div>
                <div>Mentor - {mentorName(app.mentor_id)}</div>
                <div>Status - {app.status}</div>
              </div>
            ))
          )}
        </div>
      )}

      {!showCreateForm && activeApp && activeApp.status !== 'CREATED' && (
        <div className="space-y-4">
          <div className="rounded-md border border-slate-100 bg-white p-3 text-sm shadow-sm">
            <div className="font-bold">Naslov - {activeApp.thesis_title}</div>
            <div>Mentor - {mentorName(activeApp.mentor_id)}</div>
          </div>

          {isAccepted && (
            <div className="max-w-6xl mx-auto space-y-4 pt-6">
              <h2 className="text-xl font-bold text-slate-950">Prijava završnog rada:</h2>
              <div>
                <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Naziv rada</label>
                <textarea readOnly value={activeApp.thesis_title || ''} className="min-h-[42px]" />
              </div>
              <div>
                <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Rok</label>
                <input readOnly value={activeApp.exam_period || ''} />
              </div>
              <div>
                <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Mentor</label>
                <input readOnly value={mentorName(activeApp.mentor_id)} />
              </div>
              <div>
                <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Napomena</label>
                <textarea readOnly value={activeApp.student_note || ''} />
              </div>

              <h2 className="text-xl font-bold text-slate-950">Odobravanje završnog rada:</h2>
              <div className="rounded-md border border-slate-100 bg-white p-4 text-base shadow-sm">
                Mentor je prihvatio prijavu dana: {formatDate(activeApp.accepted_at)}.
              </div>

              {isRegistered && (
                <>
                  <h3 className="text-base font-bold text-slate-950">Podaci o prijavi</h3>
                  <div className="rounded-md border border-slate-100 bg-white p-4 text-base leading-8 shadow-sm">
                    <div>Klasa: {activeApp.application_classification_number || '—'}</div>
                    <div>Ur. Broj: {activeApp.application_registry_number || '—'}</div>
                    <div>Datum: {formatDate(activeApp.application_data_entered_at || activeApp.accepted_at)}</div>
                  </div>
                </>
              )}

              <div>
                <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Napomena mentora</label>
                <textarea readOnly value={(activeApp as any).mentor_note || activeApp.rejection_note || ''} />
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleDeregister}
                  className="bg-[#0784d3] text-white px-6 py-3 rounded-md text-lg"
                >
                  Odjavi
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(showCreateForm || activeApp?.status === 'CREATED') && (
        <div className="max-w-6xl mx-auto">
          {latestDeregistered && !activeApp && (
            <div className="mb-5">
              <div className="rounded-md border border-slate-100 bg-white p-5 text-base shadow-sm">
                Završni rad je odjavljen dana: {formatDate(latestDeregistered.deregistered_at)}.
              </div>
              <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Napomena uz odjavu:</label>
              <textarea readOnly value={latestDeregistered.deregistration_note || ''} />
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-0">
            <h2 className="text-xl font-bold text-slate-950 mb-5">Prijava završnog rada:</h2>

            <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Naziv rada</label>
            <textarea
              required
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Unesite naziv rada"
              className="min-h-[42px]"
            />

            <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Rok</label>
            <select required value={form.examTerm} onChange={e => setForm({ ...form, examTerm: e.target.value })}>
              <option value="">odaberite rok prijave</option>
              <option value="Zimski">zimski rok</option>
              <option value="Ljetni">ljetni rok</option>
              <option value="Jesenski">jesenski rok</option>
            </select>

            <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Mentor</label>
            <select required value={form.mentorId} onChange={e => setForm({ ...form, mentorId: e.target.value })}>
              <option value="">odaberite mentora</option>
              {mentors.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Napomena</label>
            <textarea
              value={form.studentNote}
              onChange={e => setForm({ ...form, studentNote: e.target.value })}
              placeholder="Unesite napomenu"
              className="min-h-[58px]"
            />

            {activeApp?.status === 'CREATED' && (
              <div className="pt-4">
                <label className="text-base normal-case tracking-normal text-slate-950 mb-0">Napomena uz odjavu:</label>
                <textarea value={deregisterNote} onChange={e => setDeregisterNote(e.target.value)} />
              </div>
            )}

            <div className="flex items-center justify-center gap-10 md:gap-52 pt-3">
              <button
                type="submit"
                disabled={submitting}
                className="bg-[#0784d3] text-white px-6 py-3 rounded-md text-lg disabled:opacity-60"
              >
                Spremi
              </button>
              {activeApp?.status === 'CREATED' && (
                <>
                  <button
                    type="button"
                    onClick={handleDeregister}
                    className="bg-[#0784d3] text-white px-6 py-3 rounded-md text-lg"
                  >
                    Odjavi
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="bg-red-600 text-white px-6 py-3 rounded-md text-lg"
                  >
                    Izbriši
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
