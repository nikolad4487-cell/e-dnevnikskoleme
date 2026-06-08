import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Role } from '../../types';
import { DossierPracticumTab } from './dossier/DossierPracticumTab';
import { DossierFinencesTab } from './dossier/DossierFinencesTab';
import { DossierAiAnalyticsTab } from './dossier/DossierAiAnalyticsTab';
import { DossierRegistrationsTab } from './dossier/DossierRegistrationsTab';
import { 
  User, Mail, Phone, MapPin, Hash, Calendar, GraduationCap, 
  TrendingUp, Activity, ShieldCheck, AlertCircle, Award, 
  DollarSign, FileText, Plus, Trash2, Brain, Search 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function DigitalniDosjePage() {
  const { classId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { selectedSchoolId, selectedClassId } = useSelection();

  // Selected student
  const [studentId, setStudentId] = useState<string>('');
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [measures, setMeasures] = useState<any[]>([]);
  const [expertActivities, setExpertActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Search dropdown (For Staff/Teachers)
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [studentFilter, setStudentFilter] = useState('');

  // Form toggles / fields
  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [gName, setGName] = useState('');
  const [gRelation, setGRelation] = useState('Roditelj');
  const [gPhone, setGPhone] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [gAddress, setGAddress] = useState('');

  const [showMeasureForm, setShowMeasureForm] = useState(false);
  const [mType, setMType] = useState('Opomena razrednika');
  const [mExplanation, setMExplanation] = useState('');
  const [mDocNo, setMDocNo] = useState('');

  const [showExpertForm, setShowExpertForm] = useState(false);
  const [eType, setEType] = useState('savjetodavni razgovor s učenikom');
  const [eRole, setERole] = useState('pedagog');
  const [eDesc, setEDesc] = useState('');
  const [eConc, setEConc] = useState('');
  const [eRec, setERec] = useState('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<'OSOBNI' | 'OCJENE' | 'IZOSTANCI' | 'MJERE' | 'SLUŽBA' | 'TRAINING' | 'FINANCE' | 'REGISTRATIONS' | 'AI'>('OSOBNI');

  // Role permissions checks
  const isStaff = user?.role === Role.TEACHER || user?.role === Role.ADMIN || user?.role === Role.MAIN_ADMIN || user?.role === Role.SCHOOL_ADMIN || user?.role === Role.HOMEROOM || user?.role === Role.DEPUTY;

  // Initial determination of studentId target
  useEffect(() => {
    const urlId = searchParams.get('studentId');
    if (urlId) {
      setStudentId(urlId);
    } else if (isStaff) {
      // Teachers can pick, initially unset so they can select from sidebar directory
      setStudentId('');
    } else {
      // Student or parent -> lock to logged in user ID or child ID
      if (user?.role === Role.PARENT && (window as any).selectedChildId) {
        setStudentId((window as any).selectedChildId);
      } else if (user?.id) {
        setStudentId(user.id);
      }
    }
  }, [classId, searchParams, user, isStaff]);

  // Load students for staff dropdown selection
  useEffect(() => {
    if (!isStaff) return;
    const loadAllStudents = async () => {
      const activeClassId = classId || selectedClassId;
      console.log("DOSJE: Loading students for class:", activeClassId);
      if (!activeClassId) return;

      const { data: enrollData, error } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(*)')
        .eq('class_id', activeClassId)
        .eq('status', 'ACTIVE');

      if (error) {
        console.error("DOSJE: Error loading student enrollments", error);
        return;
      }

      if (enrollData) {
        const studentProfiles = enrollData
          .map((e: any) => e.student)
          .filter(Boolean);

        const sorted = [...studentProfiles].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'hr'));
        
        // Debug output as requested by user
        console.log("DOSJE STUDENTS", sorted);
        
        setAllStudents(sorted);
        
        // If a studentId is provided in url, make sure to set it
        const urlId = searchParams.get('studentId');
        if (urlId) {
          setStudentId(urlId);
        }
      }
    };
    loadAllStudents();
  }, [isStaff, classId, selectedClassId, searchParams]);

  // Load detailed student dossier attributes upon studentId adjustment
  useEffect(() => {
    if (!studentId) {
      setStudentProfile(null);
      return;
    }

    const loadDossierDetails = async () => {
      setLoading(true);
      try {
        // 1. Profile information
        const { data: pData } = await supabase.from('user_profiles').select('*, classes(name)').eq('id', studentId).maybeSingle();
        if (pData) setStudentProfile(pData);

        // 2. Guardians details
        const { data: gData } = await supabase.from('student_guardians').select('*').eq('student_id', studentId);
        setGuardians(gData || []);

        // 3. Summaries
        const { data: sData } = await supabase.from('student_year_summaries').select('*').eq('student_id', studentId);
        setSummaries(sData || []);

        // 4. Grades
        const { data: gradesData } = await supabase.from('grades').select('*').eq('student_id', studentId);
        setGrades(gradesData || []);

        // 5. Absences
        const { data: absencesData } = await supabase.from('absences').select('*').eq('student_id', studentId);
        setAbsences(absencesData || []);

        // 6. Pedagogical measures from new standard table
        const { data: mData } = await supabase.from('pedagogical_measures').select('*').eq('student_id', studentId);
        setMeasures(mData || []);

        // 7. Counseling Expert records
        const { data: expData } = await supabase.from('expert_service_activities').select('*').eq('student_id', studentId);
        setExpertActivities(expData || []);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadDossierDetails();
  }, [studentId]);

  // Create Guardian record
  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gName.trim()) return;

    try {
      const { error } = await supabase.from('student_guardians').insert({
        student_id: studentId,
        full_name: gName,
        relation: gRelation,
        phone: gPhone,
        email: gEmail,
        address: gAddress
      });

      if (!error) {
        toast.success('Podaci o roditelju / skrbniku uspješno spremljeni.');
        setShowGuardianForm(false);
        setGName('');
        setGPhone('');
        setGEmail('');
        setGAddress('');
        // Refresh
        const { data } = await supabase.from('student_guardians').select('*').eq('student_id', studentId);
        setGuardians(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteGuardian = async (id: string) => {
    if (!window.confirm('Sigurno obrisati podatke o roditelju?')) return;
    const { error } = await supabase.from('student_guardians').delete().eq('id', id);
    if (!error) {
      toast.success('Obrisano.');
      setGuardians(guardians.filter(g => g.id !== id));
    }
  };

  // Create Measure (Pohvala, Opomena)
  const handleAddMeasure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mExplanation.trim()) return;

    try {
      const { error } = await supabase.from('pedagogical_measures').insert({
        school_id: selectedSchoolId || studentProfile?.school_id || 'DEFAULT',
        student_id: studentId,
        class_id: studentProfile?.class_id || selectedClassId || 'DEFAULT',
        school_year: '2025/2026',
        measure_type: mType,
        date: new Date().toISOString().split('T')[0],
        explanation: mExplanation,
        issuer: user?.name || 'Predmetni nastavnik',
        document_number: mDocNo || null,
        status: 'ACTIVE'
      });

      if (!error) {
        toast.success(`Pedagoška mjera [${mType}] uspješno upisana.`);
        setShowMeasureForm(false);
        setMExplanation('');
        setMDocNo('');
        // Refresh
        const { data } = await supabase.from('pedagogical_measures').select('*').eq('student_id', studentId);
        setMeasures(data || []);
      } else {
        toast.error('Dogodila se pogreška.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleMeasureStatus = async (mId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
    const { error } = await supabase.from('pedagogical_measures').update({ status: nextStatus }).eq('id', mId);
    if (!error) {
      toast.success(nextStatus === 'ACTIVE' ? 'Mjera aktivirana.' : 'Mjera brisana / ukinuta.');
      setMeasures(measures.map(m => m.id === mId ? { ...m, status: nextStatus } : m));
    }
  };

  // Create Expert Counselor Activity Log
  const handleAddExpertLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eDesc.trim() || !eConc.trim()) return;

    try {
      const { error } = await supabase.from('expert_service_activities').insert({
        school_id: selectedSchoolId || studentProfile?.school_id || 'DEFAULT',
        student_id: studentId,
        class_id: studentProfile?.class_id || selectedClassId || 'DEFAULT',
        school_year: '2025/2026',
        activity_type: eType,
        date: new Date().toISOString().split('T')[0],
        staff_role: eRole,
        staff_name: user?.name || 'Stručni suradnik',
        description: eDesc,
        conclusion: eConc,
        recommendation: eRec
      });

      if (!error) {
        toast.success('Zapisnik stručnog razgovora pohranjen.');
        setShowExpertForm(false);
        setEDesc('');
        setEConc('');
        setERec('');
        // Refresh
        const { data } = await supabase.from('expert_service_activities').select('*').eq('student_id', studentId);
        setExpertActivities(data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Calculations
  const calculatedGpa = grades.length > 0
    ? (grades.reduce((sum, g) => sum + parseInt(g.value || '0'), 0) / grades.length).toFixed(2)
    : 'N/A';

  const groupedAbsences = absences.reduce(
    (acc, ab) => {
      if (ab.status === 'JUSTIFIED') acc.justified += 1;
      else if (ab.status === 'UNJUSTIFIED') acc.unjustified += 1;
      else acc.pending += 1;
      return acc;
    },
    { justified: 0, unjustified: 0, pending: 0 }
  );

  const filteredStudents = allStudents.filter(s => 
    s.name.toLowerCase().includes(studentFilter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] font-sans no-print text-gray-800">
      
      {/* HEADER BAR */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-sm font-black text-[#005c8d] uppercase tracking-widest flex items-center gap-1.5 leading-none">
            <GraduationCap size={18} />
            Službeni digitalni dosje učenika
          </h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">E-karton, praksa, natjecanja, pedagoška podrška i analitika</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 min-w-0 bg-[#f8fafc]">
        {/* LEFT/TOP SIDEBAR DIRECTORY (visible only for school staff) */}
        {isStaff && (
          <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white flex flex-col shrink-0 lg:h-full h-72">
            <div className="p-3 bg-slate-50 border-b border-gray-200">
              <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1.5">Popis i pretraga učenika:</span>
              <div className="relative">
                <input
                  id="student-search-dosje"
                  type="text"
                  placeholder="Pretraži učenike po imenu..."
                  value={studentFilter}
                  onChange={e => setStudentFilter(e.target.value)}
                  className="w-full bg-white border border-gray-300 text-xs px-3 py-1.5 pl-8 rounded focus:outline-none focus:border-[#005c8d]"
                />
                <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {allStudents.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400 font-bold uppercase italic">Nema učenika u ovom razredu.</div>
              ) : filteredStudents.length > 0 ? (
                filteredStudents.map(s => {
                  const isSelected = studentId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStudentId(s.id)}
                      className={`w-full text-left px-4 py-2.5 text-xs font-black uppercase tracking-tight transition-colors flex items-center gap-3 ${
                        isSelected
                          ? "bg-sky-50 text-[#005c8d] border-l-4 border-[#005c8d]"
                          : "text-gray-650 hover:bg-slate-50 border-l-4 border-transparent"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black ${
                        isSelected ? "bg-[#005c8d] text-white" : "bg-slate-100 text-slate-400"
                      }`}>
                        {s.name?.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-gray-900 truncate font-semibold">{s.name}</div>
                        <div className="text-[9px] text-gray-400 normal-case font-bold mt-0.5 tracking-wider font-mono">OIB: {s.oib || 'N/A'}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-gray-400 uppercase italic">Nema rezultata.</div>
              )}
            </div>
          </div>
        )}

        {/* DETAIL PANEL & TABS */}
        <div className="flex-1 overflow-y-auto min-w-0 h-full">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 h-full">
              <div className="w-12 h-12 border-4 border-slate-100 border-t-[#005c8d] rounded-full animate-spin mb-4" />
              <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest animate-pulse">Učitavanje cjelokupnog matičnog dosjea...</div>
            </div>
          ) : studentProfile ? (
            <div className="p-6 space-y-6">
          
          {/* PROFILE SUMMARY HERO BANNER (Džoker karton) */}
          <div className="bg-white border rounded-lg p-6 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            
            <div className="flex items-center gap-4 col-span-2">
              <div className="w-16 h-16 border rounded-full bg-slate-50 flex items-center justify-center text-[#94a3b8] shrink-0 uppercase font-black text-2xl tracking-normal border-gray-300">
                {studentProfile.name?.slice(0, 2)}
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{studentProfile.name}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 align-middle mt-1.5">
                  <span className="text-[10px] bg-sky-50 text-[#005c8d] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border border-sky-100">
                    Razred: {studentProfile.classes?.name || 'N/A'}
                  </span>
                  {studentProfile.program_adjustment && studentProfile.program_adjustment !== 'NONE' && (
                    <span className="text-[10px] bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border border-amber-100 flex items-center gap-1">
                      <Plus size={10} /> Prilagodba: {studentProfile.program_adjustment}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 col-span-2 text-[11px] font-bold text-gray-500 uppercase border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:pl-6 leading-tight">
              <div className="space-y-1">
                <span className="block text-[8px] font-black text-gray-400">EMAIL:</span>
                <span className="text-gray-800 leading-none lowercase font-semibold">{studentProfile.email || 'N/A'}</span>
              </div>
              <div className="space-y-1">
                <span className="block text-[8px] font-black text-gray-400">OIB:</span>
                <span className="text-gray-800 leading-none tracking-wider">{studentProfile.oib || 'N/A'}</span>
              </div>
              <div className="space-y-1">
                <span className="block text-[8px] font-black text-gray-400">ADRESA stanovanja:</span>
                <span className="text-gray-800 leading-none">{studentProfile.address || 'N/A'}</span>
              </div>
              <div className="space-y-1">
                <span className="block text-[8px] font-black text-gray-400">UKUPNI PROSJEK:</span>
                <span className="text-gray-800 font-extrabold text-sm text-[#005c8d]">{calculatedGpa}</span>
              </div>
            </div>

          </div>

          {/* TAB SYSTEM CHANGER */}
          <div className="flex border-b border-gray-300 overflow-x-auto gap-1">
            {[
              { id: 'OSOBNI', label: 'Osobni podaci' },
              { id: 'OCJENE', label: 'Ocjene i uspjeh' },
              { id: 'IZOSTANCI', label: 'Izostanci' },
              { id: 'MJERE', label: 'Pedagoške mjere' },
              { id: 'SLUŽBA', label: 'Stručna služba' },
              { id: 'TRAINING', label: 'Stručna praksa' },
              { id: 'FINANCE', label: 'Sl. uplate' },
              { id: 'REGISTRATIONS', label: 'Prijelazi & Natjecanja' },
              { id: 'AI', label: 'Prevencija / AI' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                id={`tab-dosje-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider border-b-2 whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  activeTab === tab.id
                    ? "border-[#005c8d] text-[#005c8d] bg-white font-bold"
                    : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-slate-100"
                }`}
              >
                {tab.id === 'AI' ? (
                  <span className="flex items-center gap-1 text-indigo-700 font-black"><Brain size={12} /> {tab.label}</span>
                ) : tab.label}
              </button>
            ))}
          </div>

          {/* TAB DETAILED PANELS */}
          <div className="bg-white border rounded-lg p-6 shadow-sm min-h-80">
            
            {/* T1: OSOBNI PODACI & SKRBNICI */}
            {activeTab === 'OSOBNI' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* General Identification card */}
                  <div className="space-y-4 border rounded p-5 bg-slate-50 border-gray-200">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-1">Matični identifikatori djeteta</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs font-semibold leading-relaxed">
                      <div>
                        <span className="block text-[8px] font-black text-gray-400 uppercase">Ime i prezime:</span>
                        {studentProfile.name}
                      </div>
                      <div>
                        <span className="block text-[8px] font-black text-gray-400 uppercase">OIB:</span>
                        {studentProfile.oib || 'N/A'}
                      </div>
                      <div>
                        <span className="block text-[8px] font-black text-gray-400 uppercase">Datum rođenja:</span>
                        {studentProfile.birth_date || 'N/A'}
                      </div>
                      <div>
                        <span className="block text-[8px] font-black text-gray-400 uppercase">Mjesto rođenja:</span>
                        {studentProfile.birth_place || 'N/A'}
                      </div>
                      <div className="col-span-2">
                        <span className="block text-[8px] font-black text-gray-400 uppercase">Adresa stanovanja:</span>
                        {studentProfile.address || 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Guardians / Contact details */}
                  <div className="space-y-4 border rounded p-5 bg-white border-gray-200">
                    <div className="flex items-center justify-between border-b pb-1">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Roditelji, skrbnici i kontakti djeteta</h4>
                      {isStaff && (
                        <button 
                          type="button"
                          id="add-guardian-btn"
                          onClick={() => setShowGuardianForm(!showGuardianForm)}
                          className="text-[9px] font-black uppercase text-[#005c8d]"
                        >
                          + Dodaj dodir
                        </button>
                      )}
                    </div>

                    {showGuardianForm && (
                      <form onSubmit={handleAddGuardian} className="bg-slate-50 border border-gray-300 p-3 rounded space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-gray-500 uppercase">
                          <div>
                            <label className="block mb-0.5">Skrbnik Ime i prezime</label>
                            <input id="g-name" type="text" required placeholder="npr. Robert Dragić" className="w-full px-2 py-1 bg-white border rounded" value={gName} onChange={e => setGName(e.target.value)} />
                          </div>
                          <div>
                            <label className="block mb-0.5">Srodstvo</label>
                            <select id="g-rel" className="w-full px-2 py-1 bg-white border rounded" value={gRelation} onChange={e => setGRelation(e.target.value)}>
                              <option value="Otac">Otac</option>
                              <option value="Majka">Majka</option>
                              <option value="Skrbnik">Skrbnik</option>
                              <option value="Sestra/Brat">Sestra/Brat</option>
                            </select>
                          </div>
                          <div>
                            <label className="block mb-0.5">Broj telefona</label>
                            <input id="g-phone" type="text" placeholder="npr. 091223344" className="w-full px-2 py-1 bg-white border rounded" value={gPhone} onChange={e => setGPhone(e.target.value)} />
                          </div>
                          <div>
                            <label className="block mb-0.5">Adresa e-pošte</label>
                            <input id="g-email" type="email" placeholder="npr. robert@gmail.com" className="w-full px-2 py-1 bg-white border rounded" value={gEmail} onChange={e => setGEmail(e.target.value)} />
                          </div>
                          <div className="col-span-2">
                            <label className="block mb-0.5">Adresa prebivališta</label>
                            <input id="g-addr" type="text" placeholder="Ulica, Mjesto" className="w-full px-2 py-1 bg-white border rounded" value={gAddress} onChange={e => setGAddress(e.target.value)} />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 text-[9px] font-black uppercase pt-1">
                          <button type="button" onClick={() => setShowGuardianForm(false)} className="px-3 py-1 border rounded bg-white text-gray-500">Otkaži</button>
                          <button type="submit" className="px-4 py-1 bg-[#005c8d] text-white rounded shadow-sm">Spremi</button>
                        </div>
                      </form>
                    )}

                    <div className="divide-y divide-gray-100 space-y-2">
                      {guardians.length > 0 ? (
                        guardians.map(g => (
                          <div key={g.id} className="pt-2 first:pt-0 flex justify-between items-start gap-4">
                            <div>
                              <div className="font-extrabold text-xs text-gray-800 uppercase">{g.full_name} ({g.relation})</div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-gray-400 font-bold uppercase mt-1 leading-none">
                                <span className="flex items-center gap-1"><Phone size={10} /> {g.phone || 'N/A'}</span>
                                <span className="flex items-center gap-1"><Mail size={10} /> {g.email || 'N/A'}</span>
                                <span className="col-span-2 flex items-center gap-1"><MapPin size={10} /> {g.address || 'N/A'}</span>
                              </div>
                            </div>
                            {isStaff && (
                              <button 
                                type="button" 
                                onClick={() => handleDeleteGuardian(g.id)}
                                className="p-1 text-red-500 hover:bg-red-50 border rounded border-transparent hover:border-red-100"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-[11px] text-gray-400 font-bold uppercase italic tracking-wider">Nema unesenog skrbnika u dosje.</div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* T2: OCJENE I SKOLSKE GODINE */}
            {activeTab === 'OCJENE' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed">
                
                {/* Academic progression history */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-1.5 flex items-center gap-1"><TrendingUp size={14} className="text-[#005c8d]" /> Povijest napredovanja po razredima</h4>
                  <div className="space-y-3">
                    {summaries.length > 0 ? (
                      summaries.map(sum => (
                        <div key={sum.id} className="border p-3.5 rounded bg-slate-50 flex justify-between items-center text-xs font-semibold uppercase">
                          <div>
                            <span className="block text-[8px] font-black text-gray-400">ŠKOLSKA GODINA:</span>
                            {sum.school_year}
                          </div>
                          <div className="text-center">
                            <span className="block text-[8px] font-black text-gray-400 text-center">PROSJEK RAZREDA:</span>
                            <span className="text-[#005c8d] font-extrabold text-sm">{sum.average || 'N/A'}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[8px] font-black text-gray-400 text-right">VLADANJE:</span>
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                              sum.behavior === 'Uzorno' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                            }`}>{sum.behavior || 'Uzorno'}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase italic">Zapisnik školskih godina je prazan.</div>
                    )}
                  </div>
                </div>

                {/* Subject final grades list */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-1.5 flex items-center gap-1"><GraduationCap size={14} className="text-[#005c8d]" /> Zaključene ocjene po strukovnim disciplinama</h4>
                  <div className="bg-white border rounded overflow-hidden shadow-sm max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                          <th className="p-2.5 pl-4">Naziv predmeta / stručni element</th>
                          <th className="p-2.5 text-center">Grades</th>
                          <th className="p-2.5 text-center">Zaključna ocjena</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-semibold text-gray-700 uppercase text-[11px]">
                        {grades.length > 0 ? (
                          grades.map(g => (
                            <tr key={g.id} className="hover:bg-slate-50/50">
                              <td className="p-2.5 pl-4 text-gray-900 font-bold">{g.subject_id}</td>
                              <td className="p-2.5 text-center text-[10px] text-gray-400 font-mono">1, 1, 3, 5, 5, 4</td>
                              <td className="p-2.5 text-center text-xs font-extrabold text-[#005c8d]">{g.value || 'N/A'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="text-center py-10 text-[10px] text-gray-400 italic">Trenutno nema unesenih ocjena u imenik.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* T3: IZOSTANCI */}
            {activeTab === 'IZOSTANCI' && (
              <div className="space-y-6">
                
                {/* Absences count summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-gray-200 p-4 rounded text-center">
                    <span className="block text-[8px] font-black text-gray-400 uppercase">OPRAVDANI SATI</span>
                    <span className="text-2xl font-black text-green-700">{groupedAbsences.justified * 7}</span>
                  </div>
                  <div className="bg-slate-50 border border-gray-200 p-4 rounded text-center">
                    <span className="block text-[8px] font-black text-gray-400 uppercase">NEOPRAVDANI SATI</span>
                    <span className="text-2xl font-black text-red-600">{groupedAbsences.unjustified * 7}</span>
                  </div>
                  <div className="bg-slate-50 border border-gray-200 p-4 rounded text-center">
                    <span className="block text-[8px] font-black text-gray-400 uppercase">ČEKAJU OPRAVDANJE</span>
                    <span className="text-2xl font-black text-amber-600">{groupedAbsences.pending * 7}</span>
                  </div>
                </div>

                <div className="bg-white border text-xs font-bold text-gray-400 uppercase tracking-widest text-center py-10 italic rounded">
                  Grupirani pregled odsutnosti po školskim radnim satima i danima
                </div>
              </div>
            )}

            {/* T4: PEDAGOSKE MJERE */}
            {activeTab === 'MJERE' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Pedagoške mjere, pohvale i rješenja</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Kronološki popis ponašanja, ukora i pohvala prema pravilniku</p>
                  </div>
                  {isStaff && (
                    <button 
                      type="button"
                      id="add-measure-btn"
                      onClick={() => setShowMeasureForm(!showMeasureForm)}
                      className="px-2.5 py-1 text-[9px] border border-[#005c8d] text-[#005c8d] bg-sky-50 font-black uppercase tracking-widest rounded"
                    >
                      Upis mjere
                    </button>
                  )}
                </div>

                {showMeasureForm && (
                  <form onSubmit={handleAddMeasure} className="bg-slate-50 border p-4 rounded space-y-3.5 animate-in fade-in duration-200 max-w-xl">
                    <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-gray-500 uppercase">
                      <div>
                        <label className="block mb-0.5">Tip pedagoške mjere</label>
                        <select id="m-type" className="w-full px-2 py-1 bg-white border rounded font-black text-[#005c8d]" value={mType} onChange={e => setMType(e.target.value)}>
                          <option value="Pohvala">Pohvala (Nagrada)</option>
                          <option value="Opomena razrednika">Opomena razrednika</option>
                          <option value="Ukor razrednika">Ukor razrednika</option>
                          <option value="Ukor razrednog vijeća">Ukor razrednog vijeća</option>
                          <option value="Opomena pred isključenje">Opomena pred isključenje</option>
                          <option value="Odluka nastavničkog vijeća">Odluka nastavničkog vijeća</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-0.5">Broj službenog dokumenta</label>
                        <input id="m-doc-no" type="text" placeholder="npr. KLASA: 602-03/25-01" className="w-full px-2 py-1 border rounded" value={mDocNo} onChange={e => setMDocNo(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Službeno obrazloženje i opis dogovora:</label>
                      <textarea id="m-explanation" rows={2.5} required placeholder="npr. Učenik je napravio izniman stručni doprinos u promociji škole, ili učestali neopravdani izostanci s nastave..." className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs bg-white" value={mExplanation} onChange={e => setMExplanation(e.target.value)} />
                    </div>
                    <div className="flex justify-end gap-2 text-[9px] font-black uppercase pt-1">
                      <button type="button" onClick={() => setShowMeasureForm(false)} className="px-3 py-1 border rounded bg-white text-gray-500">Otkaži</button>
                      <button type="submit" className="px-5 py-1 bg-[#005c8d] text-white rounded">Upis u svjedodžbu</button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {measures.length > 0 ? (
                    measures.map(m => (
                      <div key={m.id} className={`border p-4 rounded-md flex justify-between items-start gap-4 transition-all ${
                        m.status === 'REVOKED' ? "opacity-50 line-through bg-slate-50" : "bg-white shadow-sm hover:shadow"
                      }`}>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-block px-2.5 py-0.5 text-[8px] font-black uppercase rounded tracking-wider ${
                              m.measure_type === 'Pohvala' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>{m.measure_type}</span>
                            <span className="text-[9px] text-gray-400 font-extrabold">{m.date} • Ispisao: {m.issuer}</span>
                          </div>
                          {m.document_number && (
                            <div className="text-[9px] font-mono text-gray-500 font-semibold mb-1">DOKUMENT: {m.document_number}</div>
                          )}
                          <p className="text-xs text-gray-700 font-semibold leading-relaxed">"{m.explanation}"</p>
                        </div>
                        {isStaff && (
                          <button 
                            type="button" 
                            onClick={() => handleToggleMeasureStatus(m.id, m.status)}
                            className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-wider border whitespace-nowrap cursor-pointer ${
                              m.status === 'REVOKED'
                                ? "bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200"
                                : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                            }`}
                          >
                            {m.status === 'REVOKED' ? 'REAKTIVIRAJ' : 'UKINI / BRIŠI'}
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-20 bg-slate-50/50 border border-dashed rounded text-xs font-bold text-gray-400 uppercase tracking-widest italic">
                      Učenik nema zabilježenih pedagoških pritužbi, opomena ili pohvala u tekućoj školskoj godini.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* T5: STRUČNA SLUŽBA (Counselor meetings) */}
            {activeTab === 'SLUŽBA' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Djelatnosti stručne službe (Pedagog, psiholog, rehabilitator)</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Privatni arhiv stručnih mišljenja, kriznih interveniranja i planova podrške</p>
                  </div>
                  {isStaff && (
                    <button 
                      type="button"
                      id="add-expert-btn"
                      onClick={() => setShowExpertForm(!showExpertForm)}
                      className="px-2.5 py-1 text-[9px] border border-[#005c8d] text-[#005c8d] bg-sky-50 font-black uppercase tracking-widest rounded"
                    >
                      Bilježi suradnju
                    </button>
                  )}
                </div>

                {showExpertForm && (
                  <form onSubmit={handleAddExpertLog} className="bg-slate-50 border p-4 rounded space-y-3.5 animate-in fade-in duration-200 max-w-xl">
                    <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-gray-500 uppercase">
                      <div>
                        <label className="block mb-0.5">Vrsta suradnje</label>
                        <select id="e-type-select" className="w-full px-2 py-1 bg-white border rounded font-semibold text-gray-700" value={eType} onChange={e => setEType(e.target.value)}>
                          <option value="savjetodavni razgovor s učenikom">Savjetodavni razgovor s učenikom</option>
                          <option value="razgovor s roditeljem">Razgovor s roditeljem</option>
                          <option value="razgovor s nastavnikom">Razgovor s predmetnim nastavnikom</option>
                          <option value="procjena">Zajednička procjena / Opservacija</option>
                          <option value="plan podrške">Sklapanje plana podrške u učenju</option>
                          <option value="prilagodba programa">Analiza i nadzor prilagodbe programa</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-0.5">Uloga stručnog suradnika</label>
                        <select id="e-role-select" className="w-full px-2 py-1 bg-white border rounded font-semibold text-gray-700" value={eRole} onChange={e => setERole(e.target.value)}>
                          <option value="pedagog">Školski pedagog</option>
                          <option value="psiholog">Školski psiholog</option>
                          <option value="edukacijski rehabilitator">Edukacijski rehabilitator</option>
                          <option value="socijalni pedagog">Psihosocijalni suradnik</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Opis situacije i tijek razgovora:</label>
                      <textarea id="e-desc" rows={2} required placeholder="npr. Učenik iskazuje pad motivacije, izbjegavanje nastave tijekom testova..." className="w-full px-2 py-1 border rounded text-xs bg-white" value={eDesc} onChange={e => setEDesc(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Zaključak suradnika:</label>
                        <textarea id="e-conc" rows={2} required placeholder="Donijet je dogovor o tjednom javljanju..." className="w-full px-2 py-1 border rounded text-xs bg-white" value={eConc} onChange={e => setEConc(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Preporuka za roditelje/razrednika:</label>
                        <textarea id="e-rec" rows={2} placeholder="Nadzirati učenje kod kuće..." className="w-full px-2 py-1 border rounded text-xs bg-white" value={eRec} onChange={e => setERec(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-[9px] font-black uppercase pt-1">
                      <button type="button" onClick={() => setShowExpertForm(false)} className="px-3 py-1 border rounded bg-white text-gray-500">Otkaži</button>
                      <button type="submit" className="px-5 py-1 bg-[#005c8d] text-white rounded">Pohrani bilješku</button>
                    </div>
                  </form>
                )}

                <div className="space-y-4">
                  {expertActivities.length > 0 ? (
                    expertActivities.map(log => (
                      <div key={log.id} className="border border-indigo-100 bg-indigo-50/10 p-5 rounded-md space-y-3.5 shadow-sm hover:bg-slate-50/50 transition-all">
                        <div className="flex items-center justify-between border-b border-indigo-100/50 pb-1.5 header-sub">
                          <span className="text-[11px] font-black text-indigo-700 uppercase tracking-widest">
                            {log.activity_type}
                          </span>
                          <span className="text-[9px] text-[#94a3b8] font-extrabold font-mono uppercase">
                            Zapisano: {log.date}
                          </span>
                        </div>
                        <div className="space-y-3 text-xs leading-normal">
                          <div>
                            <span className="block text-[8px] font-black text-slate-400 uppercase">Tijek i opis dogovora:</span>
                            <p className="text-slate-800 font-semibold whitespace-pre-wrap leading-relaxed">"{log.description}"</p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <span className="block text-[8px] font-black text-slate-400 uppercase">Donijeti zaključak:</span>
                              <p className="text-emerald-700 font-extrabold whitespace-pre-wrap">✔ {log.conclusion}</p>
                            </div>
                            {log.recommendation && (
                              <div>
                                <span className="block text-[8px] font-black text-slate-400 uppercase">Službena preporuka i plan:</span>
                                <p className="text-indigo-600 font-bold whitespace-pre-wrap">★ {log.recommendation}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider pt-2 border-t border-dashed border-indigo-100/30">
                          Zapisnik vodio: {log.staff_role} • {log.staff_name}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-20 bg-slate-50/50 border border-dashed rounded text-xs font-bold text-gray-400 uppercase tracking-widest italic">
                      Nema upisanih razgovora ili stručnih dijagnoza s članovima stručne pedagoške službe u dosjeu.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* T6: STRUČNA PRAKSA */}
            {activeTab === 'TRAINING' && (
              <DossierPracticumTab 
                studentId={studentId} 
                isStaff={isStaff} 
                schoolYear="2025/2026" 
                classId={studentProfile?.class_id}
                schoolId={selectedSchoolId || studentProfile?.school_id}
              />
            )}

            {/* T7: FINANCIJSKE UPLATE */}
            {activeTab === 'FINANCE' && (
              <DossierFinencesTab 
                studentId={studentId} 
                studentName={studentProfile.name} 
                isStaff={isStaff} 
                schoolId={selectedSchoolId || studentProfile?.school_id}
                classId={studentProfile?.class_id}
              />
            )}

            {/* T8: PRIJELAZI & NATJECANJA */}
            {activeTab === 'REGISTRATIONS' && (
              <DossierRegistrationsTab 
                studentId={studentId} 
                isStaff={isStaff} 
                schoolId={selectedSchoolId || studentProfile?.school_id}
                currentClassId={studentProfile?.class_id}
                currentClassName={studentProfile?.classes?.name}
              />
            )}

            {/* T9: AI ANALITIKA & PREVENCIJA GUBITKA GODINE */}
            {activeTab === 'AI' && (
              <DossierAiAnalyticsTab 
                studentId={studentId} 
                studentName={studentProfile.name}
                gpa={parseFloat(calculatedGpa) || 0}
                grades={grades.map(g => ({ subject: g.subject_id, value: g.value }))}
                absencesJustified={groupedAbsences.justified * 7}
                absencesUnjustified={groupedAbsences.unjustified * 7}
                conduct={studentProfile.program_adjustment || 'NONE'}
                pedagogicalMeasures={measures.map(m => ({ type: m.measure_type, explanation: m.explanation }))}
              />
            )}

          </div>

        </div>
      ) : (
        <div className="text-center py-32 bg-white flex flex-col items-center flex-1 font-sans justify-center h-full">
          <GraduationCap className="text-gray-300 mb-4" size={56} />
          <h4 className="text-base font-black text-gray-800 uppercase tracking-wide">Digitalni dosje učenika</h4>
          <p className="text-xs text-gray-400 max-w-sm mt-1 leading-normal">Odaberite učenika za prikaz digitalnog dosjea.</p>
        </div>
      )}

        </div>
      </div>

    </div>
  );
}
