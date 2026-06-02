import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { 
  FileText, Plus, Trash2, Calendar, User, 
  AlertCircle, CheckCircle2, History, XCircle, Ban
} from 'lucide-react';
import { ThesisApplication } from '../../types';

export default function FinalThesisPage() {
  const { user, isParent, selectedChildId } = useAuth();
  const studentId = isParent ? selectedChildId : user?.id;

  const [applications, setApplications] = useState<ThesisApplication[]>([]);
  const [mentors, setMentors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAccessible, setIsAccessible] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Checking access logic
  useEffect(() => {
    if (!studentId) return;
    const checkAccess = async () => {
        const { data: enrollment } = await supabase
            .from('student_class_enrollments')
            .select('class_id, student_id, classes:class_id(grade_level, program_id, programs:program_id(duration_years))')
            .eq('student_id', studentId)
            .eq('status', 'ACTIVE')
            .maybeSingle();

        if (enrollment && enrollment.classes) {
            const clazz = enrollment.classes as any;
            const program = clazz.programs as any;
            if (program && clazz.grade_level !== undefined) {
               setIsAccessible(clazz.grade_level === program.duration_years);
            } else {
               setIsAccessible(false);
            }
        } else {
            setIsAccessible(false);
        }
    };
    checkAccess();
  }, [studentId]);

  // Form State
  const [title, setTitle] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [examTerm, setExamTerm] = useState('Ljetni');
  const [studentNote, setStudentNote] = useState('');

  // Deregistration State
  const [showDeregisterModal, setShowDeregisterModal] = useState(false);
  const [deregisteringApp, setDeregisteringApp] = useState<ThesisApplication | null>(null);
  const [deregisterNote, setDeregisterNote] = useState('');

  const fetchAppData = async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      // Fetch mentors
      const { data: mentorsData } = await supabase
        .from('user_profiles')
        .select('id, name, role')
        .in('role', ['TEACHER', 'HOMEROOM', 'ADMIN', 'SCHOOL_ADMIN']);
      setMentors(mentorsData || []);

      // Fetch applications via api route
      const response = await fetch(`/api/final-thesis?studentId=${studentId}`);
      if (response.ok) {
        const data = await response.json();
        setApplications(data || []);
      } else {
        // Fallback to Supabase directly
        const { data } = await supabase
          .from('final_thesis')
          .select('*')
          .eq('student_id', studentId)
          .order('submitted_at', { ascending: false });
        if (data) setApplications(data as any[]);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Greška pri učitavanju podataka.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAccessible) {
        fetchAppData();
    }
  }, [studentId, isAccessible]);

  // Check if has active application
  const activeApp = applications.find(
    app => app.status === 'CREATED' || app.status === 'ACCEPTED'
  );

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    if (activeApp) {
      toast.error('Već imate aktivnu prijavu!');
      return;
    }
    if (!title.trim() || !mentorId || !examTerm) {
      toast.error('Molimo popunite sva obavezna polja.');
      return;
    }

    setSubmitting(true);
    try {
      // Get student's class and school from user profile or enrollment
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('class_id, school_id')
        .eq('id', studentId)
        .maybeSingle();

      const class_id = profile?.class_id || 'N/A';
      const school_id = profile?.school_id || 'N/A';

      const appPayload = {
        student_id: studentId,
        class_id,
        school_id,
        thesis_title: title.trim(),
        mentor_id: mentorId,
        exam_period: examTerm,
        student_note: studentNote.trim(),
        status: 'CREATED'
      };

      const response = await fetch('/api/final-thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appPayload)
      });

      if (response.ok) {
        toast.success('Prijava uspješno podnesena!');
        setTitle('');
        setMentorId('');
        setStudentNote('');
        fetchAppData();
      } else {
        throw new Error('Could not submit');
      }
    } catch (err: any) {
      toast.error('Greška pri slanju prijave.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteApplication = async (id: string) => {
    if (!confirm('Jeste li sigurni da želite obrisati prijavu?')) return;

    try {
      const response = await fetch(`/api/final-thesis/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Prijava uspješno obrisana.');
        fetchAppData();
      } else {
        throw new Error('Delete failed');
      }
    } catch (err: any) {
      toast.error('Greška pri brisanju prijave.');
    }
  };

  const handleDeregisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deregisteringApp || !deregisterNote.trim()) {
      toast.error('Molimo unesite razlog odjave.');
      return;
    }

    try {
      const response = await fetch(`/api/final-thesis/${deregisteringApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DEREGISTERED',
          deregistration_note: deregisterNote,
          deregistered_at: new Date().toISOString()
        })
      });

      if (response.ok) {
        toast.success('Barijera uspješno odjavljena te poslana na odobrenje.');
        setShowDeregisterModal(false);
        setDeregisteringApp(null);
        setDeregisterNote('');
        fetchAppData();
      } else {
        throw new Error('Deregistration update failed');
      }
    } catch (err) {
      toast.error('Greška pri odjavi.');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CREATED':
        return <span className="px-2 py-1 text-xs font-black bg-blue-100 text-blue-800 rounded">PODNESENO (CREATED)</span>;
      case 'ACCEPTED':
        return <span className="px-2 py-1 text-xs font-black bg-emerald-100 text-emerald-800 rounded">PRIHVAĆENO (ACCEPTED)</span>;
      case 'REJECTED':
        return <span className="px-2 py-1 text-xs font-black bg-rose-100 text-rose-800 rounded">ODBIJENO (REJECTED)</span>;
      case 'DEREGISTERED':
        return <span className="px-2 py-1 text-xs font-black bg-amber-100 text-amber-800 rounded">ODJAVLJENO (DEREGISTERED)</span>;
      case 'COMPLETED':
        return <span className="px-2 py-1 text-xs font-black bg-indigo-100 text-indigo-800 rounded">DOVRŠENO (COMPLETED)</span>;
      default:
        return <span className="px-2 py-1 text-xs font-black bg-gray-100 text-gray-800 rounded">{status}</span>;
    }
  };

  if (loading || isAccessible === null) {
    return (
      <div className="p-8 flex items-center justify-center font-sans text-gray-500">
        Učitavanje podataka o završnom radu...
      </div>
    );
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
    <div className="p-6 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tight">Prijava i obrana završnog rada</h1>
        <p className="text-xs text-gray-500 font-bold uppercase mt-1">Pregled vašeg rada i rokova obrane</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Middle area: Active application orsubmission form */}
        <div className="lg:col-span-2 space-y-6">
          {activeApp ? (
            <div className="bg-white rounded-lg border-2 border-blue-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#005c8d]">
                  <FileText size={20} />
                  <span className="font-black uppercase text-xs tracking-wider">Aktivna prijava završnog rada</span>
                </div>
                {getStatusBadge(activeApp.status)}
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-xs text-gray-400 font-black uppercase tracking-wider">Naslov završnog rada</h3>
                  <p className="text-base font-bold text-gray-900 mt-1">{activeApp.thesis_title}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <h3 className="text-xs text-gray-400 font-black uppercase tracking-wider">Odabrani mentor</h3>
                    <p className="font-semibold text-gray-800 mt-1 flex items-center gap-1">
                      <User size={14} className="text-gray-400" />
                      {mentors.find(m => m.id === activeApp.mentor_id)?.name || 'Opći mentor / Nepoznato'}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs text-gray-400 font-black uppercase tracking-wider">Rok obrane</h3>
                    <p className="font-semibold text-gray-800 mt-1 flex items-center gap-1">
                      <Calendar size={14} className="text-gray-400" />
                      {activeApp.exam_period} rok
                    </p>
                  </div>
                </div>

                {activeApp.student_note && (
                  <div className="bg-slate-50 p-3 rounded border border-slate-100">
                    <h3 className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Vaša napomena</h3>
                    <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">{activeApp.student_note}</p>
                  </div>
                )}

                {activeApp.status === 'ACCEPTED' && (
                  <div className="bg-emerald-50 text-emerald-800 p-3.5 rounded border border-emerald-200 flex items-center gap-2 font-semibold text-xs leading-normal">
                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                    <span>
                      Mentor je prihvatio prijavu dana: {activeApp.accepted_at ? new Date(activeApp.accepted_at).toLocaleDateString('hr-HR') : '—'}
                    </span>
                  </div>
                )}

                {activeApp.application_classification_number && (
                  <div className="bg-emerald-50/50 p-3 rounded border border-emerald-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="font-bold text-emerald-800 block">Klasa prijavnice:</span>
                      <span className="font-mono text-gray-700">{activeApp.application_classification_number}</span>
                    </div>
                    <div>
                      <span className="font-bold text-emerald-800 block">Urudžbeni broj prijavnice:</span>
                      <span className="font-mono text-gray-700">{activeApp.application_registry_number}</span>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                  <span>Datum podnošenja: {new Date(activeApp.submitted_at).toLocaleDateString('hr-HR')}</span>
                  
                  {activeApp.status === 'CREATED' && (
                    <button
                      onClick={() => handleDeleteApplication(activeApp.id)}
                      className="flex items-center gap-1 text-red-600 hover:text-red-800 font-black uppercase tracking-wider transition-colors"
                    >
                      <Trash2 size={14} />
                      Obriši prijavu
                    </button>
                  )}

                  {activeApp.status === 'ACCEPTED' && (
                    <button
                      onClick={() => {
                        setDeregisteringApp(activeApp);
                        setShowDeregisterModal(true);
                      }}
                      className="flex items-center gap-1 text-amber-600 hover:text-amber-800 font-black uppercase tracking-wider transition-colors"
                    >
                      <Ban size={14} />
                      Odjavi obranu radnje
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              {applications.filter(app => app.status === 'REJECTED').slice(0, 1).map(rejectedApp => (
                <div key={rejectedApp.id} className="bg-rose-50 border border-rose-200 text-rose-900 rounded p-4 mb-5 text-xs leading-normal">
                  <div className="flex items-start gap-2">
                    <XCircle size={16} className="text-rose-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong className="block text-rose-800 font-bold mb-0.5">Prethodna prijava odbijena:</strong>
                      <span>
                        Mentor je odbio prijavu dana: {rejectedApp.rejected_at ? new Date(rejectedApp.rejected_at).toLocaleDateString('hr-HR') : '—'}
                      </span>
                      {rejectedApp.rejection_note && (
                        <div className="mt-2 bg-rose-100/50 p-2.5 rounded border border-rose-200 text-rose-800 italic">
                          <strong>Razlog odbijanja:</strong> {rejectedApp.rejection_note}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 text-[#005c8d] mb-4 border-b border-gray-100 pb-3">
                <Plus size={20} />
                <h2 className="font-black uppercase text-sm tracking-wider">Nova prijava završnog rada</h2>
              </div>

              <form onSubmit={handleSubmitApplication} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">
                    Predloženi naslov završnog rada <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Unesite točan ili predloženi naslov rada..."
                    className="w-full text-sm font-semibold p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">
                      Mentor <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={mentorId}
                      onChange={(e) => setMentorId(e.target.value)}
                      className="w-full text-sm font-semibold p-2.5 border border-gray-300 rounded bg-white focus:outline-[#005c8d]"
                    >
                      <option value="">-- Odaberite mentora --</option>
                      {mentors.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">
                      Rok obrane <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={examTerm}
                      onChange={(e) => setExamTerm(e.target.value)}
                      className="w-full text-sm font-semibold p-2.5 border border-gray-300 rounded bg-white focus:outline-[#005c8d]"
                    >
                      <option value="Zimski">Zimski rok</option>
                      <option value="Ljetni">Ljetni rok</option>
                      <option value="Jesenski">Jesenski rok</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">
                    Napomena mentoru (ili dodatne napomene)
                  </label>
                  <textarea
                    value={studentNote}
                    onChange={(e) => setStudentNote(e.target.value)}
                    placeholder="Unesite važne informacije, dogovorene detalje..."
                    className="w-full text-sm p-2.5 border border-gray-300 rounded h-24 focus:outline-[#005c8d] resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#005c8d] hover:bg-[#004a70] text-white py-3 rounded text-center text-xs font-black uppercase tracking-widest transition-all shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Slanje...' : 'POŠALJI PRIJAVU RADNJE'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right sidebar: Rules and summary info */}
        <div className="space-y-6">
          <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-5 text-xs text-amber-900 leading-relaxed space-y-3">
            <h3 className="font-black text-xs uppercase text-amber-800 flex items-center gap-1">
              <AlertCircle size={14} /> Pravila i upute za završni rad
            </h3>
            <ul className="list-disc pl-4 space-y-2 font-medium">
              <li>Možete imati <strong>samo jednu</strong> aktivnu prijavu za obranu.</li>
              <li>Dok je prijava u statusu <strong>CREATED</strong>, možete je obrisati i ponovno poslati ako ste napravili pogrešku.</li>
              <li>Nakon što mentor <strong>PRIHVATI (ACCEPTED)</strong> projekt, prijava se zaključava i ne može se obrisati.</li>
              <li>Ako trebate promijeniti prihvaćenu obranu, morate podnijeti <strong>zahtjev za odjavu</strong> uz obavezan razlog.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* History of submissions wrapper */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-black uppercase text-sm tracking-wider text-gray-800 mb-4 flex items-center gap-2">
          <History size={18} className="text-gray-500" />
          Povijest prijava i odjava
        </h2>

        {applications.filter(app => app.id !== activeApp?.id).length === 0 ? (
          <p className="text-xs text-gray-400 italic font-bold">Nema povijesnih unosa prijava.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 uppercase font-black">
                  <th className="p-3">Naslov rada</th>
                  <th className="p-3">Mentor</th>
                  <th className="p-3">Rok obrane</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Prijavnica Klasa/Urbroj</th>
                  <th className="p-3">Odjavnica Klasa/Urbroj</th>
                  <th className="p-3">Razlog odbijanja / odjave</th>
                </tr>
              </thead>
              <tbody>
                {applications
                  .filter(app => app.id !== activeApp?.id)
                  .map((app) => (
                    <tr key={app.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-800">{app.thesis_title}</td>
                      <td className="p-3 font-semibold text-gray-600">
                        {mentors.find(m => m.id === app.mentor_id)?.name || 'Opći mentor'}
                      </td>
                      <td className="p-3 font-semibold text-gray-600">{app.exam_period}</td>
                      <td className="p-3 font-bold">{getStatusBadge(app.status)}</td>
                      <td className="p-3 font-mono text-gray-500">
                        {app.application_classification_number ? (
                          <>
                            {app.application_classification_number} <br />
                            {app.application_registry_number}
                          </>
                        ) : '—'}
                      </td>
                      <td className="p-3 font-mono text-gray-500">
                        {app.deregistration_classification_number ? (
                          <>
                            {app.deregistration_classification_number} <br />
                            {app.deregistration_registry_number}
                          </>
                        ) : '—'}
                      </td>
                      <td className="p-3 text-red-700 italic max-w-xs truncate">
                        {app.status === 'REJECTED' ? app.rejection_note : (app.deregistration_note || '—')}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deregister Modal */}
      {showDeregisterModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-gray-800 uppercase tracking-tight mb-2">Odjava obrane završnog rada</h3>
            <p className="text-xs text-gray-500 mb-4">Molimo unesite valjan razlog za odjavu obrane. Ovaj zahtjev šalje se mentoru i školi na odobrenje.</p>
            
            <form onSubmit={handleDeregisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-1">Razlog odjave i objašnjenje</label>
                <textarea
                  required
                  value={deregisterNote}
                  onChange={(e) => setDeregisterNote(e.target.value)}
                  placeholder="Unesite razloge npr. promjena teme, medicinski razlozi..."
                  className="w-full text-xs p-3 border border-gray-300 rounded h-24 focus:outline-[#005c8d] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeregisterModal(false);
                    setDeregisteringApp(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-xs font-black uppercase tracking-wider"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white rounded text-xs font-black uppercase tracking-wider hover:bg-amber-700"
                >
                  Pošalji zahtjev
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
