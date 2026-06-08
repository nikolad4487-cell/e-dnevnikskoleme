import React, { useState, useEffect } from 'react';
import { Placement, PracticumLog, PracticumEvaluation } from './DossierTypes';
import { ClipboardList, Award, Plus, Trash2, CheckCircle2, ChevronDown, Check, User } from 'lucide-react';
import toast from 'react-hot-toast';

interface DossierPracticumTabProps {
  studentId: string;
  isStaff: boolean;
  schoolYear: string;
  classId?: string;
  schoolId?: string;
}

export function DossierPracticumTab({ studentId, isStaff, schoolYear, classId, schoolId }: DossierPracticumTabProps) {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string>('');
  const [logs, setLogs] = useState<PracticumLog[]>([]);
  const [evaluation, setEvaluation] = useState<PracticumEvaluation | null>(null);
  const [loading, setLoading] = useState(false);

  // Forms states
  const [showPlacementForm, setShowPlacementForm] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyOib, setCompanyOib] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [mentorName, setMentorName] = useState('');
  const [mentorContact, setMentorContact] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [showLogForm, setShowLogForm] = useState(false);
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [hoursWorked, setHoursWorked] = useState('8');
  const [activityDescription, setActivityDescription] = useState('');

  const [showEvalForm, setShowEvalForm] = useState(false);
  const [engagementGrade, setEngagementGrade] = useState('5');
  const [expertiseGrade, setExpertiseGrade] = useState('5');
  const [communicationGrade, setCommunicationGrade] = useState('5');
  const [finalGrade, setFinalGrade] = useState('5');
  const [evalNotes, setEvalNotes] = useState('');

  // Fetch placements
  const fetchPlacements = async () => {
    try {
      const res = await fetch(`/api/practicum-placements?studentId=${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data);
        if (data.length > 0 && !selectedPlacementId) {
          setSelectedPlacementId(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch logs & evaluations for the selected placement
  useEffect(() => {
    fetchPlacements();
  }, [studentId]);

  useEffect(() => {
    if (!selectedPlacementId) {
      setLogs([]);
      setEvaluation(null);
      return;
    }

    const fetchLogsAndEvals = async () => {
      setLoading(true);
      try {
        const [logsRes, evalsRes] = await Promise.all([
          fetch(`/api/practicum-logs?placementId=${selectedPlacementId}`),
          fetch(`/api/practicum-evaluations?placementId=${selectedPlacementId}`)
        ]);

        if (logsRes.ok) {
          const lData = await logsRes.json();
          setLogs(lData);
        }
        if (evalsRes.ok) {
          const eData = await evalsRes.json();
          setEvaluation(eData.length > 0 ? eData[0] : null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchLogsAndEvals();
  }, [selectedPlacementId, studentId]);

  // Submit placement
  const handleAddPlacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error('Naziv tvrtke je obavezan.');
      return;
    }
    if (!companyOib || companyOib.length !== 11) {
      toast.error('OIB mora sadržavati točno 11 znamenki.');
      return;
    }

    try {
      const res = await fetch('/api/practicum-placements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          class_id: classId,
          school_id: schoolId,
          school_year: schoolYear,
          company_name: companyName,
          company_oib: companyOib,
          company_address: companyAddress,
          mentor_name: mentorName,
          mentor_contact: mentorContact,
          start_date: startDate || null,
          end_date: endDate || null
        })
      });

      if (res.ok) {
        toast.success('Ugovor o stručnoj praksi uspješno kreiran.');
        setShowPlacementForm(false);
        setCompanyName('');
        setCompanyOib('');
        setCompanyAddress('');
        setMentorName('');
        setMentorContact('');
        fetchPlacements();
      } else {
        toast.error('Pogreška pri spremanju ugovora.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Veza sa serverom nije uspjela.');
    }
  };

  // Submit daily log
  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityDescription.trim()) {
      toast.error('Opis aktivnosti je obavezan.');
      return;
    }

    try {
      const res = await fetch('/api/practicum-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placement_id: selectedPlacementId,
          student_id: studentId,
          date: logDate,
          hours_worked: parseInt(hoursWorked),
          activity_description: activityDescription,
          mentor_signature: 'Nije potpisano'
        })
      });

      if (res.ok) {
        toast.success('Dnevni izvještaj spremljen.');
        setShowLogForm(false);
        setActivityDescription('');
        // Refresh logs list
        const logsRes = await fetch(`/api/practicum-logs?placementId=${selectedPlacementId}`);
        if (logsRes.ok) setLogs(await logsRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete placement
  const handleDeletePlacement = async (id: string) => {
    if (!window.confirm('Sigurno želite raskinuti ugovor o praksi i izbrisati sve podatke?')) return;
    try {
      const res = await fetch(`/api/practicum-placements/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Ugovor raskinut.');
        setSelectedPlacementId('');
        fetchPlacements();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle log signature (Teacher Only)
  const handleToggleSignature = async (log: PracticumLog) => {
    if (!isStaff) return;
    const newSig = log.mentor_signature === 'Potpisano' ? 'Nije potpisano' : 'Potpisano';
    try {
      const res = await fetch(`/api/practicum-logs/${log.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentor_signature: newSig })
      });

      if (res.ok) {
        toast.success(newSig === 'Potpisano' ? 'Izvješće potpisano.' : 'Potpis uklonjen.');
        const updatedLogs = logs.map(l => l.id === log.id ? { ...l, mentor_signature: newSig as any } : l);
        setLogs(updatedLogs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Submit evaluation (Teacher Only)
  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlacementId) return;

    try {
      const res = await fetch('/api/practicum-evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placement_id: selectedPlacementId,
          student_id: studentId,
          engagement_grade: parseInt(engagementGrade),
          expertise_grade: parseInt(expertiseGrade),
          communication_grade: parseInt(communicationGrade),
          final_grade: parseInt(finalGrade),
          notes: evalNotes,
          evaluator_name: isStaff ? 'Praksa voditelj' : 'Vanjski mentor'
        })
      });

      if (res.ok) {
        toast.success('Ocjena o stručnoj praksi uspješno upisana u svjedodžbu.');
        setShowEvalForm(false);
        const data = await res.json();
        setEvaluation(data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Pogreška pri ocjenjivanju.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 uppercase">Stručna praksa i praktična nastava</h3>
          <p className="text-xs text-gray-500 font-medium">Ugovori, dnevnici rada, upisani odrađeni sati i mentorske ocjene</p>
        </div>
        {isStaff && (
          <button 
            type="button"
            id="add-placement-btn"
            onClick={() => setShowPlacementForm(!showPlacementForm)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#005c8d] hover:bg-[#004a70] text-white text-xs font-black uppercase tracking-wider rounded shadow transition-all cursor-pointer"
          >
            <Plus size={14} /> Novi ugovor o praksi
          </button>
        )}
      </div>

      {/* NEW PLACEMENT FORM */}
      {showPlacementForm && (
        <form onSubmit={handleAddPlacement} className="bg-slate-50 border border-gray-300 p-5 rounded space-y-4 shadow-sm animate-in fade-in duration-200">
          <div className="text-xs font-black text-gray-700 uppercase tracking-widest border-b pb-1.5 mb-2">Ugovaranje stručne prakse</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Naziv ustanove / tvrtke</label>
              <input id="p-company-name" type="text" placeholder="npr. Hotel Dubrovnik" required className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">OIB tvrtke</label>
              <input 
                id="p-company-oib" 
                type="text" 
                placeholder="11 znamenki" 
                maxLength={11}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs" 
                value={companyOib} 
                onChange={e => {
                  const value = e.target.value.replace(/\D/g, '');
                  setCompanyOib(value.slice(0, 11));
                }} 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Adresa tvrtke</label>
              <input id="p-company-addr" type="text" placeholder="Ulica, Mjesto" className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Mentor u tvrtki</label>
              <input id="p-mentor" type="text" placeholder="Ime i prezime" className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs" value={mentorName} onChange={e => setMentorName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Kontakt mentora</label>
              <input id="p-contact" type="text" placeholder="Mobitel / Email" className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs" value={mentorContact} onChange={e => setMentorContact(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Početak</label>
                <input id="p-start" type="date" className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Kraj</label>
                <input id="p-end" type="date" className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowPlacementForm(false)} className="px-4 py-2 border border-gray-300 text-gray-500 text-[10px] font-black uppercase rounded bg-white">Odustani</button>
            <button type="submit" className="px-5 py-2 bg-[#005c8d] text-white text-[10px] font-black uppercase rounded shadow">Kreiraj ugovor</button>
          </div>
        </form>
      )}

      {/* PLACEMENT LEAFLET */}
      {placements.length > 0 ? (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#f8fafc] border border-gray-200 p-4 rounded shadow-sm">
            <div className="space-y-1">
              <label className="block text-[9px] font-black uppercase tracking-wider text-gray-400">Tekuće ugovoreno mjesto obavljanja prakse</label>
              <div className="flex items-center gap-3">
                <select 
                  id="select-placement-id"
                  className="bg-white border border-gray-300 text-xs font-bold uppercase px-3 py-1.5 rounded outline-none focus:border-[#005c8d]"
                  value={selectedPlacementId}
                  onChange={e => setSelectedPlacementId(e.target.value)}
                >
                  {placements.map(p => (
                    <option key={p.id} value={p.id}>{p.company_name} ({p.school_year})</option>
                  ))}
                </select>
                {isStaff && (
                  <button 
                    type="button" 
                    onClick={() => handleDeletePlacement(selectedPlacementId)}
                    className="p-1.5 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded"
                    title="Raskini ugovor"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const currentP = placements.find(x => x.id === selectedPlacementId);
              if (!currentP) return null;
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-[11px] text-gray-600 font-semibold uppercase">
                  <div>
                    <span className="block text-[8px] font-black text-gray-400 pb-0.5">OIB i adresa tvrtke:</span>
                    {currentP.company_oib || 'N/A'} • {currentP.company_address || 'N/A'}
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-gray-400 pb-0.5">Mentor i kontakt:</span>
                    {currentP.mentor_name || 'N/A'} ({currentP.mentor_contact || 'N/A'})
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-gray-400 pb-0.5">Period obavljanja:</span>
                    {currentP.start_date || 'N/A'} do {currentP.end_date || 'N/A'}
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-gray-400 pb-0.5">Ukupno sati:</span>
                    <span className="text-[#005c8d] font-black text-xs">{logs.reduce((sum, current) => sum + current.hours_worked, 0)} sati</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* COMPREHENSIVE DAILY LOGS (EVIDENCIJA CHRONICLE) */}
            <div className="space-y-4 border border-gray-200/80 p-5 rounded-md bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <ClipboardList size={14} className="text-[#005c8d]" /> Dnevnik rada i aktivnosti
                </h4>
                <button 
                  type="button"
                  id="add-log-btn"
                  onClick={() => setShowLogForm(!showLogForm)}
                  className="px-2.5 py-1 text-[9px] border border-[#005c8d] text-[#005c8d] bg-sky-50 hover:bg-[#005c8d]/10 font-black uppercase tracking-widest rounded"
                >
                  Zapiši sate
                </button>
              </div>

              {showLogForm && (
                <form onSubmit={handleAddLog} className="border border-gray-200 p-3 bg-slate-50 space-y-3 rounded">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-gray-500 mb-0.5">Datum</label>
                      <input id="l-date" type="date" required className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white" value={logDate} onChange={e => setLogDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-gray-500 mb-0.5">Broj odrađenih sati</label>
                      <input id="l-hours" type="number" required min="1" max="12" className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-gray-500 mb-0.5">Kratak opis izvedenih aktivnosti</label>
                    <textarea id="l-desc" rows={2} required placeholder="Skribaj npr. Priprema ugostiteljskog stola, rad na catering lokaciji, pripremanje priloga..." className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white" value={activityDescription} onChange={e => setActivityDescription(e.target.value)} />
                  </div>
                  <div className="flex justify-end gap-2 text-[9px] font-black uppercase">
                    <button type="button" onClick={() => setShowLogForm(false)} className="px-3 py-1 border border-gray-300 rounded bg-white text-gray-500">Otkaži</button>
                    <button type="submit" className="px-4 py-1 bg-[#005c8d] hover:bg-[#004a70] text-white rounded">Spremi zapis</button>
                  </div>
                </form>
              )}

              {loading ? (
                <div className="text-center py-4 text-xs font-bold uppercase tracking-widest text-gray-400">Učitavanje dnevnika...</div>
              ) : logs.length > 0 ? (
                <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1 divide-y divide-gray-100">
                  {logs.map(log => (
                    <div key={log.id} className="pt-2.5 first:pt-0 flex items-start gap-4 justify-between">
                      <div className="flex-1">
                        <span className="inline-block px-1.5 py-0.5 text-[8px] font-black bg-slate-100 text-slate-500 tracking-wider uppercase rounded mb-1">{log.date} • {log.hours_worked} sati</span>
                        <p className="text-xs text-gray-800 font-semibold">{log.activity_description}</p>
                      </div>
                      <button 
                        type="button"
                        id={`sig-btn-${log.id}`}
                        onClick={() => handleToggleSignature(log)}
                        disabled={!isStaff}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[8px] font-black tracking-widest uppercase border transition-all ${
                          log.mentor_signature === 'Potpisano'
                            ? "bg-green-50 text-green-700 border-green-200" 
                            : "bg-red-50 text-red-600 border-red-200"
                        } ${isStaff ? "cursor-pointer hover:opacity-85" : "cursor-not-allowed"}`}
                      >
                        <Check size={8} /> {log.mentor_signature === 'Potpisano' ? 'POTPISANO' : 'ČEKA POTPIS'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest italic bg-slate-50 border border-dashed rounded">Dnevnik je prazan. Izvršeni radovi se upisuju tjedno.</div>
              )}
            </div>

            {/* PRACTICUM QUALITY EVALUATIONS (MENTORSKE OCJENE) */}
            <div className="space-y-4 border border-gray-200/80 p-5 rounded-md bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Award size={14} className="text-[#005c8d]" /> Mentorsko ocjenjivanje stručne prakse
                </h4>
                {isStaff && !showEvalForm && (
                  <button 
                    type="button"
                    id="add-eval-btn"
                    onClick={() => {
                      if (evaluation) {
                        setEngagementGrade(String(evaluation.engagement_grade));
                        setExpertiseGrade(String(evaluation.expertise_grade));
                        setCommunicationGrade(String(evaluation.communication_grade));
                        setFinalGrade(String(evaluation.final_grade));
                        setEvalNotes(evaluation.notes || '');
                      }
                      setShowEvalForm(true);
                    }}
                    className="px-2.5 py-1 text-[9px] border border-[#005c8d] text-[#005c8d] bg-sky-50 hover:bg-[#005c8d]/10 font-black uppercase tracking-widest rounded"
                  >
                    {evaluation ? 'Uredi ocjene' : 'Ocjeni rad'}
                  </button>
                )}
              </div>

              {showEvalForm && (
                <form onSubmit={handleSaveEvaluation} className="bg-slate-50 border border-gray-200 rounded p-4 space-y-3.5 animate-in fade-in duration-200">
                  <div className="text-[10px] font-black text-[#005c8d] uppercase tracking-wider">Mentorski upis ocjena u imenik i svjedodžbu</div>
                  <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-gray-500 uppercase">
                    <div>
                      <label className="block mb-0.5">Zalaganje (1-5)</label>
                      <select id="e-engagement" className="w-full px-2 py-1 bg-white border rounded border-gray-300 font-black text-[#005c8d]" value={engagementGrade} onChange={e => setEngagementGrade(e.target.value)}>
                        <option value="5">ODLIČAN (5)</option>
                        <option value="4">VRLO DOBAR (4)</option>
                        <option value="3">DOBAR (3)</option>
                        <option value="2">DOVOLJAN (2)</option>
                        <option value="1">NEDOVOLJAN (1)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-0.5">Stručnost i vještina (1-5)</label>
                      <select id="e-expertise" className="w-full px-2 py-1 bg-white border rounded border-gray-300 font-black text-[#005c8d]" value={expertiseGrade} onChange={e => setExpertiseGrade(e.target.value)}>
                        <option value="5">ODLIČAN (5)</option>
                        <option value="4">VRLO DOBAR (4)</option>
                        <option value="3">DOBAR (3)</option>
                        <option value="2">DOVOLJAN (2)</option>
                        <option value="1">NEDOVOLJAN (1)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-0.5">Komunikacija u timu (1-5)</label>
                      <select id="e-comms" className="w-full px-2 py-1 bg-white border rounded border-gray-300 font-black text-[#005c8d]" value={communicationGrade} onChange={e => setCommunicationGrade(e.target.value)}>
                        <option value="5">ODLIČAN (5)</option>
                        <option value="4">VRLO DOBAR (4)</option>
                        <option value="3">DOBAR (3)</option>
                        <option value="2">DOVOLJAN (2)</option>
                        <option value="1">NEDOVOLJAN (1)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-0.5">Konačna ocjena prakse</label>
                      <select id="e-final" className="w-full px-2 py-1 bg-white border rounded border-gray-300 text-sm font-black text-white bg-[#005c8d]" value={finalGrade} onChange={e => setFinalGrade(e.target.value)}>
                        <option value="5">ODLIČAN (5)</option>
                        <option value="4">VRLO DOBAR (4)</option>
                        <option value="3">DOBAR (3)</option>
                        <option value="2">DOVOLJAN (2)</option>
                        <option value="1">NEDOVOLJAN (1)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-500 mb-0.5">Mentalna zapažanja, napomene i opis ponašanja:</label>
                    <textarea id="e-notes" rows={2} placeholder="npr. Učenik je pokazao stopostotnu točnost i vrhunske gastronomske vještine." className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs bg-white" value={evalNotes} onChange={e => setEvalNotes(e.target.value)} />
                  </div>
                  <div className="flex justify-end gap-2 text-[9px] font-black uppercase">
                    <button type="button" onClick={() => setShowEvalForm(false)} className="px-3 py-1 border rounded bg-white text-gray-500">Zatvori</button>
                    <button type="submit" className="px-4 py-1 bg-[#005c8d] text-white rounded shadow">Spremi ocjenu</button>
                  </div>
                </form>
              )}

              {evaluation ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-md flex items-center justify-between">
                    <div>
                      <span className="block text-[8px] font-black text-emerald-600 uppercase tracking-wider pb-0.5">KONAČNA OCJENA U SVJEDODŽBI</span>
                      <span className="text-xl font-black text-emerald-800 uppercase">
                        {evaluation.final_grade === 5 && 'ODLIČAN (5)'}
                        {evaluation.final_grade === 4 && 'VRLO DOBAR (4)'}
                        {evaluation.final_grade === 3 && 'DOBAR (3)'}
                        {evaluation.final_grade === 2 && 'DOVOLJAN (2)'}
                        {evaluation.final_grade === 1 && 'NEDOVOLJAN (1)'}
                      </span>
                    </div>
                    <CheckCircle2 className="text-emerald-500 shrink-0" size={32} />
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-50 border border-gray-200/50 p-2.5 rounded">
                      <span className="block text-[8px] font-black text-gray-400 uppercase">ZALAGANJE</span>
                      <span className="text-sm font-black text-gray-700">{evaluation.engagement_grade}/5</span>
                    </div>
                    <div className="bg-slate-50 border border-gray-200/50 p-2.5 rounded">
                      <span className="block text-[8px] font-black text-gray-400 uppercase">STRUČNOST</span>
                      <span className="text-sm font-black text-gray-700">{evaluation.expertise_grade}/5</span>
                    </div>
                    <div className="bg-slate-50 border border-gray-200/50 p-2.5 rounded">
                      <span className="block text-[8px] font-black text-gray-400 uppercase">KOMUNIKACIJA</span>
                      <span className="text-sm font-black text-gray-700">{evaluation.communication_grade}/5</span>
                    </div>
                  </div>

                  {evaluation.notes && (
                    <div className="bg-slate-50 p-3.5 border rounded-md">
                      <span className="block text-[8px] font-black text-slate-400 uppercase pb-1">Mentorsko obrazloženje i zapažanje:</span>
                      <p className="text-xs text-slate-700 font-semibold whitespace-pre-wrap leading-relaxed">"{evaluation.notes}"</p>
                    </div>
                  )}

                  <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wide italic">Ocjenjivanje izvršio: {evaluation.evaluator_name || 'Predmetni nastavnik'}</div>
                </div>
              ) : (
                <div className="text-center py-10 text-xs font-bold text-gray-400 uppercase tracking-widest italic bg-slate-50 border border-dashed rounded">Nema unesenih mentorskih ocjena za odabrano mjesto prakse.</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-[#f8fafc] border border-dashed border-gray-300 rounded flex flex-col items-center">
          <ClipboardList className="text-gray-300 mb-3" size={40} />
          <h4 className="text-sm font-bold text-gray-700 uppercase">Ugovor o praksi nije sklopljen</h4>
          <p className="text-xs text-gray-400 max-w-sm mt-1 leading-snug">Svaki učenik strukovnog programskog smjera mora imati zaključen i unesen ugovor o obavljanju stručne/godišnje prakse s licenciranim obrtom ili tvrtkom.</p>
        </div>
      )}
    </div>
  );
}
