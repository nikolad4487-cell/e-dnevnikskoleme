import React, { useState, useEffect } from 'react';
import { StudentRegistration, Competition } from './DossierTypes';
import { Award, RefreshCw, Plus, Trash2, ArrowUpRight, ArrowDownLeft, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

interface DossierRegistrationsTabProps {
  studentId: string;
  isStaff: boolean;
  schoolId?: string;
  currentClassId?: string;
  currentClassName?: string;
}

export function DossierRegistrationsTab({ studentId, isStaff, schoolId, currentClassId, currentClassName }: DossierRegistrationsTabProps) {
  const [registrations, setRegistrations] = useState<StudentRegistration[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Status/Enrollment Action forms
  const [showRegForm, setShowRegForm] = useState(false);
  const [actionType, setActionType] = useState<'UPIS' | 'ISPIS' | 'PREMJESTAJ' | 'PRIJELAZ_IZ' | 'PRIJELAZ_U'>('PREMJESTAJ');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [otherSchool, setOtherSchool] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  // Competition forms
  const [showCompForm, setShowCompForm] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [mentorName, setMentorName] = useState('');
  const [level, setLevel] = useState<'Školsko' | 'Županijsko' | 'Državno' | 'Međunarodno'>('Školsko');
  const [result, setResult] = useState('');
  const [placement, setPlacement] = useState('');
  const [compDate, setCompDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch school classes for relocation dropdown
  const fetchClasses = async () => {
    try {
      // Just mock search or pull from window variables or API
      const res = await fetch('/api/classes'); 
      // If we don't have a reliable `/api/classes` endpoint, we fall back to a reasonable hardcoded program list or let them type it.
      // Wait, we have classes, let's read classes from API if available.
      if (res.ok) {
        const raw = await res.json();
        // Fallback to array if it's an object or list
        const list = Array.isArray(raw) ? raw : (raw.data || []);
        setSchoolClasses(list);
      }
    } catch (e) {
      console.warn("Could not load classes dropdown, falling back to empty:", e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [regRes, compRes] = await Promise.all([
        fetch(`/api/student-registrations?studentId=${studentId}`),
        fetch(`/api/competitions?studentId=${studentId}`)
      ]);

      if (regRes.ok) setRegistrations(await regRes.json());
      if (compRes.ok) setCompetitions(await compRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (isStaff) {
      fetchClasses();
    }
  }, [studentId]);

  // Handle Enrollment Action
  const handleRecordAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionType === 'PREMJESTAJ' && !selectedClassId) {
      toast.error('Molimo odaberite novi razred.');
      return;
    }

    const newClassObj = schoolClasses.find(c => c.id === selectedClassId);
    try {
      const res = await fetch('/api/student-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          action_type: actionType,
          reason,
          school_id: schoolId,
          former_class_id: currentClassId,
          former_class_name: currentClassName || "Nije dodijeljeno",
          new_class_id: selectedClassId || null,
          new_class_name: newClassObj ? newClassObj.name : "",
          other_school_name: otherSchool,
          details,
          registered_by: 'Administrator / Razrednik'
        })
      });

      if (res.ok) {
        toast.success(`Promjena statusa uplate i registracijskog usmjerenja ${actionType} upisana.`);
        setShowRegForm(false);
        setReason('');
        setDetails('');
        setOtherSchool('');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Record Competition Success
  const handleAddCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) {
      toast.error('Predmet je obavezan.');
      return;
    }

    try {
      const res = await fetch('/api/competitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          school_id: schoolId,
          subject_name: subjectName,
          mentor_name: mentorName,
          level,
          result,
          placement,
          date: compDate
        })
      });

      if (res.ok) {
        toast.success('Zapis o natjecanju spremljen u službenu arhivu.');
        setShowCompForm(false);
        setSubjectName('');
        setMentorName('');
        setResult('');
        setPlacement('');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCompetition = async (id: string) => {
    if (!window.confirm('Sigurno želite obrisati natjecateljski zapis?')) return;
    try {
      const res = await fetch(`/api/competitions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Zapis obrisan.');
        setCompetitions(competitions.filter(c => c.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ENROLLMENT, REGISTRATION & CLASS TRANSFERS (EVIDENCIJA UPISA I ISPISA) */}
      <div className="space-y-4 border border-gray-200/80 p-5 rounded-md bg-white shadow-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Upisi, ispisi i premještaji razreda</h4>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Registar upisa/ispisa i trajna evidencija povijesti premještaja</p>
          </div>
          {isStaff && (
            <button 
              type="button"
              id="add-reloc-btn"
              onClick={() => setShowRegForm(!showRegForm)}
              className="px-2.5 py-1 text-[9px] border border-[#005c8d] text-[#005c8d] bg-sky-50 font-black uppercase tracking-widest rounded"
            >
              Upiši promjenu
            </button>
          )}
        </div>

        {showRegForm && (
          <form onSubmit={handleRecordAction} className="bg-slate-50 border p-4 rounded space-y-3 animate-in fade-in duration-200">
            <div>
              <label className="block text-[9px] font-bold uppercase text-gray-500 mb-0.5">Vrsta promjene</label>
              <select id="r-action" className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs font-black uppercase text-[#005c8d]" value={actionType} onChange={e => setActionType(e.target.value as any)}>
                <option value="PREMJESTAJ">PREMJESTAJ U DRUGI RAZRED (INTERNO)</option>
                <option value="UPIS">PRVI UPIS U ŠKOLU</option>
                <option value="ISPIS">ISPIS IZ ŠKOLE</option>
                <option value="PRIJELAZ_IZ">PRIJELAZ IZ DRUGE SREDNJE ŠKOLE</option>
                <option value="PRIJELAZ_U">PRIJELAZ U DRUGU SREDNJU ŠKOLU</option>
              </select>
            </div>

            {actionType === 'PREMJESTAJ' && (
              <div>
                <label className="block text-[9px] font-bold uppercase text-gray-500 mb-0.5">Odaberite ciljni razred</label>
                <select id="r-target-class" className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs" value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
                  <option value="">-- Odaberite novi razred --</option>
                  {schoolClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {(actionType === 'PRIJELAZ_IZ' || actionType === 'PRIJELAZ_U') && (
              <div>
                <label className="block text-[9px] font-bold uppercase text-gray-500 mb-0.5">Naziv druge škole</label>
                <input id="r-other-school" type="text" placeholder="npr. Ugostiteljska škola Opatija" className="w-full px-2 py-1 border rounded text-xs" value={otherSchool} onChange={e => setOtherSchool(e.target.value)} />
              </div>
            )}

            <div>
              <label className="block text-[9px] font-bold uppercase text-gray-500 mb-0.5">Razlog promjene (Službeno obrazloženje):</label>
              <input id="r-reason" type="text" required placeholder="npr. Preseljenje obitelji, promjena strukovnog smjera iz kuhara u konobara..." className="w-full px-2 py-1 border rounded text-xs bg-white" value={reason} onChange={e => setReason(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 text-[9px] font-black uppercase pt-1">
              <button type="button" onClick={() => setShowRegForm(false)} className="px-3 py-1 border rounded bg-white text-gray-500">Zatvori</button>
              <button type="submit" className="px-4 py-1 bg-[#005c8d] text-white rounded">Spremi</button>
            </div>
          </form>
        )}

        <div className="max-h-[30rem] overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="text-center py-10 text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Učitavanje povijesti statusa...</div>
          ) : registrations.length > 0 ? (
            registrations.map(reg => (
              <div key={reg.id} className="border border-gray-200/50 p-3.5 rounded bg-slate-50 flex items-start gap-3.5 transition-all">
                <div className={`p-2 rounded shrink-0 ${
                  reg.action_type === 'UPIS' || reg.action_type === 'PRIJELAZ_IZ'
                    ? "bg-emerald-100 text-emerald-800" 
                    : reg.action_type === 'ISPIS' || reg.action_type === 'PRIJELAZ_U'
                      ? "bg-red-100 text-red-800"
                      : "bg-[#005c8d]/10 text-[#005c8d]"
                }`}>
                  {reg.action_type === 'UPIS' || reg.action_type === 'PRIJELAZ_IZ' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-extrabold text-[11px] text-gray-900 tracking-tight uppercase">STATUS: {reg.action_type}</span>
                    <span className="text-[9px] text-gray-400 font-extrabold font-mono">{reg.date}</span>
                  </div>
                  {reg.action_type === 'PREMJESTAJ' && (
                    <p className="text-[10px] text-[#005c8d] font-bold uppercase mb-1">
                      Premještaj iz {reg.former_class_name} u {reg.new_class_name}
                    </p>
                  )}
                  {reg.other_school_name && (
                    <p className="text-[10px] text-indigo-700 font-bold uppercase mb-1">
                      Ustanova prijelaza: {reg.other_school_name}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-600 font-semibold leading-relaxed">Razlog: {reg.reason}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 text-xs font-bold text-gray-400 uppercase tracking-widest italic bg-slate-50 border rounded border-dashed">
              Nema registrirane promjene statusa. Student ima zadani aktivni upis u razred.
            </div>
          )}
        </div>
      </div>

      {/* NATIONAL & INTERNATIONAL COMPETITIONS (NATJECANJA) */}
      <div className="space-y-4 border border-gray-200/80 p-5 rounded-md bg-white shadow-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Arhiva i kronologija natjecanja</h4>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Akademska, gastronomska i sportska natjecanja</p>
          </div>
          {isStaff && (
            <button 
              type="button"
              id="add-comp-btn"
              onClick={() => setShowCompForm(!showCompForm)}
              className="px-2.5 py-1 text-[9px] border border-[#005c8d] text-[#005c8d] bg-sky-50 font-black uppercase tracking-widest rounded"
            >
              Novi uspjeh
            </button>
          )}
        </div>

        {showCompForm && (
          <form onSubmit={handleAddCompetition} className="bg-slate-50 border p-4 rounded space-y-3.5 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-gray-500 uppercase">
              <div>
                <label className="block mb-0.5">Predmet / Disciplina</label>
                <input id="c-subject" type="text" placeholder="npr. Kuharska umjetnost" required className="w-full px-2 py-1 bg-white border rounded text-xs font-semibold" value={subjectName} onChange={e => setSubjectName(e.target.value)} />
              </div>
              <div>
                <label className="block mb-0.5">Predmetni mentor</label>
                <input id="c-mentor" type="text" placeholder="Ime i prezime nastavnika" className="w-full px-2 py-1 bg-white border rounded text-xs font-semibold" value={mentorName} onChange={e => setMentorName(e.target.value)} />
              </div>
              <div>
                <label className="block mb-0.5">Razina natjecanja</label>
                <select id="c-level" className="w-full px-2 py-1 bg-white border rounded text-xs" value={level} onChange={e => setLevel(e.target.value as any)}>
                  <option value="Školsko">Školsko</option>
                  <option value="Županijsko">Županijsko</option>
                  <option value="Državno">Državno</option>
                  <option value="Međunarodno">Međunarodno</option>
                </select>
              </div>
              <div>
                <label className="block mb-0.5">Datum natjecanja</label>
                <input id="c-date" type="date" className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs font-semibold" value={compDate} onChange={e => setCompDate(e.target.value)} />
              </div>
              <div>
                <label className="block mb-0.5">Rezultat / Bodovi</label>
                <input id="c-result" type="text" placeholder="npr. 94/100 bodova" className="w-full px-2 py-1 bg-white border rounded text-xs font-semibold" value={result} onChange={e => setResult(e.target.value)} />
              </div>
              <div>
                <label className="block mb-0.5">Ostvareni plasman</label>
                <input id="c-placement" type="text" placeholder="npr. 1. mjesto (Zlatna medalja)" className="w-full px-2 py-1 bg-white border rounded text-xs font-semibold" value={placement} onChange={e => setPlacement(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 text-[9px] font-black uppercase pt-1">
              <button type="button" onClick={() => setShowCompForm(false)} className="px-3 py-1 border rounded bg-white text-gray-500">Zatvori</button>
              <button type="submit" className="px-4 py-1 bg-[#005c8d] text-white rounded shadow">Spremi natjecanje</button>
            </div>
          </form>
        )}

        <div className="max-h-[30rem] overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="text-center py-10 text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Učitavanje postignuća...</div>
          ) : competitions.length > 0 ? (
            competitions.map(comp => (
              <div key={comp.id} className="border border-amber-200 bg-amber-50/20 p-4 rounded flex items-start justify-between gap-4 transition-all hover:bg-amber-50/40">
                <div className="flex items-start gap-3">
                  <div className="p-2 border border-amber-300/50 bg-amber-100 text-amber-800 rounded shrink-0">
                    <Award size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-extrabold text-xs text-amber-900 tracking-tight uppercase">{comp.subject_name}</span>
                      <span className="inline-block px-1.5 py-0.5 text-[7px] font-black uppercase rounded bg-amber-100 text-amber-800 tracking-wider font-mono">{comp.level}</span>
                    </div>
                    {comp.placement && (
                      <p className="font-extrabold text-[#005c8d] text-xs uppercase my-0.5">{comp.placement}</p>
                    )}
                    <p className="text-[10px] text-gray-500 font-bold uppercase leading-tight">
                      Mentor: {comp.mentor_name || 'Nije upisan'} • Bodovi: {comp.result || 'N/A'}
                    </p>
                    <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest mt-1 font-mono">ODRŽANO Datum: {comp.date}</p>
                  </div>
                </div>
                {isStaff && (
                  <button 
                    type="button" 
                    onClick={() => handleDeleteCompetition(comp.id)}
                    className="p-1 text-red-500 hover:bg-red-50 border rounded border-transparent hover:border-red-100 shrink-0"
                    title="Ukloni natjecanje"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-20 text-xs font-bold text-gray-400 uppercase tracking-widest italic bg-slate-50 border rounded border-dashed">
              Nema registriranih natjecanja ili plasmana na državnoj/županijskoj razini za ovog učenika.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
