import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { logSystemAction } from '../../utils/auditLogger';
import { 
  FileText, Check, X, FileEdit, UserCheck, 
  Search, ShieldAlert, GraduationCap, Filter, ClipboardList
} from 'lucide-react';
import { Role, ThesisApplication } from '../../types';
import ThesisGradingModal from '../../components/ThesisGradingModal';
import FinalExamDefenseScheduleModal from '../../components/FinalExamDefenseScheduleModal';

export default function FinalThesisTeacherPage() {
  const { user, userSchoolRoles, isMainAdmin } = useAuth();
  const { selectedSchoolId, selectedClassId } = useSelection();

  // Determine role in selected school
  const currentSchoolRoles = userSchoolRoles.filter(r => r.schoolId === selectedSchoolId).map(r => r.role);
  const isSchoolAdmin = isMainAdmin || currentSchoolRoles.includes(Role.SCHOOL_ADMIN) || currentSchoolRoles.includes(Role.ADMIN);

  const [applications, setApplications] = useState<ThesisApplication[]>([]);
  const [defenseSchedules, setDefenseSchedules] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [mentors, setMentors] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter tab options
  const [activeTab, setActiveTab] = useState<'mentorship' | 'class' | 'all' | 'archive' | 'defense'>('mentorship');

  const [isDefenseScheduleModalOpen, setIsDefenseScheduleModalOpen] = useState(false);
  const [editDefenseSchedule, setEditDefenseSchedule] = useState<any>(null);

  // search term filter
  const [searchTerm, setSearchTerm] = useState('');

  const handleDeleteDefenseSchedule = async (scheduleId: string, classNameStr?: string) => {
    console.log("DELETE DEFENSE START", scheduleId);

    try {
      console.log("DELETE DEFENSE AFTER START");

      if (!scheduleId) {
        console.error("Missing scheduleId");
        return;
      }

      console.log("SUPABASE URL", import.meta.env.VITE_SUPABASE_URL);

      const defenseId = scheduleId;
      const check = await supabase
        .from("final_exam_defense_schedule")
        .select("*")
        .eq("id", defenseId);

      console.log("CHECK DEFENSE BEFORE DELETE", check);

      if (check.error) {
        console.error("CHECK DEFENSE ERROR", check.error);
        return;
      }

      if (!check.data || check.data.length === 0) {
        console.error("DEFENSE ROW NOT FOUND BEFORE DELETE", defenseId);
        alert("Aplikacija ne vidi taj zapis u tablici. Provjeri Supabase URL/projekt ili krivu tablicu.");
        return;
      }

      console.log("BEFORE DEFENSE SUPABASE DELETE", scheduleId);

      const result = await supabase
        .from("final_exam_defense_schedule")
        .delete()
        .eq("id", scheduleId)
        .select();

      console.log("AFTER DEFENSE SUPABASE DELETE", result);

      if (result.error) {
        console.error("DELETE DEFENSE ERROR", result.error);
        alert("Greška pri brisanju obrane: " + result.error.message);
        return;
      }

      if (!result.data || result.data.length === 0) {
        console.error("DELETE DEFENSE DID NOT DELETE ANY ROW", scheduleId);
        alert("Obrana nije obrisana iz baze. Provjeri id i RLS policy.");
        return;
      }

      console.log("DELETE DEFENSE SUCCESS", result.data);

      setDefenseSchedules((prev) => prev.filter((item) => item.id !== scheduleId));
      
      toast.success('Raspored obrane uspješno obrisan!');
    } catch (err: any) {
      console.error("DELETE DEFENSE CRASHED", err);
      alert("Brisanje obrane se srušilo. Pogledaj konzolu.");
    }
  };

  // Classifications modal
  const [showClassifyModal, setShowClassifyModal] = useState(false);
  const [classifyingApp, setClassifyingApp] = useState<ThesisApplication | null>(null);
  const [classificationNum, setClassificationNum] = useState('');
  const [registryNum, setRegistryNum] = useState('');

  // Deregistration classifications modal
  const [showDeregisterClassifyModal, setShowDeregisterClassifyModal] = useState(false);
  const [deregClassifyingApp, setDeregClassifyingApp] = useState<ThesisApplication | null>(null);
  const [deregClassificationNum, setDeregClassificationNum] = useState('');
  const [deregRegistryNum, setDeregRegistryNum] = useState('');

  // Rejection modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingApp, setRejectingApp] = useState<ThesisApplication | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');

  // Grading modal
  const [showGradingModal, setShowGradingModal] = useState(false);
  const [gradingApp, setGradingApp] = useState<ThesisApplication | null>(null);

  // Defense schedule schedule state
  const [showDefenseModal, setShowDefenseModal] = useState(false);
  const [defensingApp, setDefensingApp] = useState<any | null>(null);
  const [defDate, setDefDate] = useState('');
  const [defTime, setDefTime] = useState('09:00');
  const [defClassroom, setDefClassroom] = useState('');
  const [defCommittee, setDefCommittee] = useState('');

  const [canAccessClass, setCanAccessClass] = useState(true);

  useEffect(() => {
    if (selectedClassId) {
        const check = async () => {
             const { data: clazz } = await supabase
                .from('classes')
                .select('grade_level, program_id, programs:program_id(duration_years)')
                .eq('id', selectedClassId)
                .maybeSingle();
            if (clazz) {
                const program = clazz.programs as any;
                if (program && clazz.grade_level) {
                    setCanAccessClass(clazz.grade_level === program.duration_years);
                } else {
                    setCanAccessClass(false);
                }
            } else {
                setCanAccessClass(false);
            }
        };
        check();
    } else {
        setCanAccessClass(true);
    }
  }, [selectedClassId]);

  const fetchDefenseSchedules = async () => {
    if (!selectedSchoolId) return;
    try {
      const schedsRes = await fetch(`/api/final-exam-defense-schedules?schoolId=${selectedSchoolId}`);
      if (schedsRes.ok) {
        const schedsData = await schedsRes.json();
        setDefenseSchedules(schedsData || []);
      }
    } catch (err) {
      console.error("FINAL EXAM DEFENSE LOAD ERROR:", err);
    }
  };

  const fetchTeacherData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Students
      const { data: studentsData } = await supabase
        .from('user_profiles')
        .select('id, name, class_id')
        .eq('role', 'STUDENT');
      setStudents(studentsData || []);

      // 2. Fetch Mentors
      const { data: mentorsData } = await supabase
        .from('user_profiles')
        .select('id, name, role')
        .in('role', ['TEACHER', 'HOMEROOM', 'ADMIN', 'SCHOOL_ADMIN']);
      setMentors(mentorsData || []);

      // 3. Fetch Classes
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name, homeroom_teacher_id, grade_level, school_year_id, school_id, programs:program_id(duration_years, name)');
      setClasses(classesData || []);

      // 4. Fetch Applications via API
      const response = await fetch('/api/final-thesis');
      if (response.ok) {
        const data = await response.json();
        setApplications(data || []);
      } else {
        // Fallback directly to Supabase
        const { data } = await supabase
          .from('final_thesis_applications')
          .select('*')
          .order('submitted_at', { ascending: false });
        if (data) setApplications(data as any[]);
      }

      // 5. Fetch Defense Schedules
      await fetchDefenseSchedules();
    } catch (err: any) {
      console.error(err);
      toast.error('Učitavanje završnih radova nije uspjelo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeacherData();
  }, [user?.id, selectedClassId]);

  // Actions
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    if (!confirm(`Jeste li sigurni da želite promijeniti status u ${newStatus}?`)) return;

    console.log(`[STATUS_UPDATE] Initiating update of application ${id} to status ${newStatus}. Clicked by user ${user?.id}`);

    try {
      const payload: any = { 
        status: newStatus,
        updated_at: new Date().toISOString()
      };
      if (newStatus === 'ACCEPTED') {
        payload.accepted_at = new Date().toISOString();
        payload.accepted_by = user?.id;
      }

      console.log(`[STATUS_UPDATE] Payload: ${JSON.stringify(payload)}`);

      const response = await fetch(`/api/final-thesis/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log(`[STATUS_UPDATE] Response OK: ${response.ok}, Status: ${response.status}`);

      if (response.ok) {
        if (newStatus === 'ACCEPTED') {
          toast.success("Rad je prihvaćen.");
        } else {
          toast.success(`Prijava uspješno postavljena u status: ${newStatus}`);
        }
        fetchTeacherData();
      } else {
        throw new Error(`Update status failed with status ${response.status}`);
      }
    } catch (err: any) {
      console.error("[STATUS_UPDATE] Failed to update application:", err);
      toast.error('Promjena statusa nije uspjela.');
    }
  };

  const handleGradingSubmit = async (data: any) => {
    if (!gradingApp) return;

    try {
      const payload: any = {
        ...data,
        status: (data.defense_grade ? 'THESIS_DEFENSE_GRADED' : (data.creation_grade ? 'THESIS_WORK_GRADED' : gradingApp.status)),
        updated_at: new Date().toISOString()
      };
      if (data.creation_grade) payload.creation_graded_by = user?.id;
      if (data.defense_grade) payload.defense_graded_by = user?.id;
      if (data.final_grade) {
          payload.final_graded_by = user?.id;
          payload.status = 'THESIS_FINAL_GRADED';
      }

      console.log(`[STATUS_UPDATE] Grading application ${gradingApp.id}, Payload: ${JSON.stringify(payload)}`);

      const response = await fetch(`/api/final-thesis/${gradingApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success("Ocjene spremljene.");
        setShowGradingModal(false);
        setGradingApp(null);
        fetchTeacherData();
      } else {
        throw new Error(`Grading update failed with status ${response.status}`);
      }
    } catch (err: any) {
      console.error("[STATUS_UPDATE] Failed to grade application:", err);
      toast.error('Spremanje ocjena nije uspjelo.');
    }
  };

  const handleDefenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!defensingApp) return;

    try {
      const response = await fetch(`/api/final-thesis/${defensingApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defense_date: defDate,
          defense_time: defTime,
          defense_classroom: defClassroom,
          defense_committee: defCommittee
        })
      });

      if (response.ok) {
        toast.success('Termin obrane rada uspješno raspoređen!');
        setShowDefenseModal(false);
        setDefensingApp(null);
        
        // Log action
        if (user?.id) {
          // Import dynamic logger
          const { logSystemAction } = await import('../../utils/auditLogger');
          await logSystemAction({
            executor_id: user.id,
            school_id: selectedSchoolId || 'N/A',
            action_type: 'SCHEDULE_THESIS_DEFENSE',
            entity_type: 'FINAL_THESIS',
            entity_id: defensingApp.id,
            new_value: { date: defDate, classroom: defClassroom }
          });
        }
        
        fetchTeacherData();
      } else {
        throw new Error('Failed to update defense');
      }
    } catch (err) {
      toast.error('Nije moguće spremiti termin obrane.');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingApp) return;

    console.log(`[STATUS_UPDATE] Initiating REJECT of application ${rejectingApp.id} with reason "${rejectionNote}". Clicked by user ${user?.id}`);

    try {
      const payload: any = {
        status: 'REJECTED',
        rejected_at: new Date().toISOString(),
        rejected_by: user?.id,
        rejection_note: rejectionNote,
        updated_at: new Date().toISOString()
      };

      console.log(`[STATUS_UPDATE] Payload: ${JSON.stringify(payload)}`);

      const response = await fetch(`/api/final-thesis/${rejectingApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log(`[STATUS_UPDATE] Response OK: ${response.ok}, Status: ${response.status}`);

      if (response.ok) {
        toast.success("Prijava je odbijena.");
        setShowRejectModal(false);
        setRejectingApp(null);
        setRejectionNote('');
        fetchTeacherData();
      } else {
        throw new Error(`Reject status failed with status ${response.status}`);
      }
    } catch (err: any) {
      console.error("[STATUS_UPDATE] Failed to reject application:", err);
      toast.error('Odbijanje prijave nije uspjelo.');
    }
  };

  const handleClassificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classifyingApp) return;

    try {
      const response = await fetch(`/api/final-thesis/${classifyingApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_classification_number: classificationNum,
          application_registry_number: registryNum,
          application_data_entered_at: new Date().toISOString(),
          application_data_entered_by: user?.id
        })
      });

      if (response.ok) {
        toast.success('Klasifikacijske oznake prijavnice spremljene.');
        setShowClassifyModal(false);
        setClassifyingApp(null);
        setClassificationNum('');
        setRegistryNum('');
        fetchTeacherData();
      } else {
        throw new Error('Save classifications failed');
      }
    } catch (err) {
      toast.error('Greška pri spremanju klasifikacijskih oznaka.');
    }
  };

  const handleDeregClassificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deregClassifyingApp) return;

    try {
      const response = await fetch(`/api/final-thesis/${deregClassifyingApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETED', // Complete the workflow once deregistration class/urbr are logged
          deregistration_classification_number: deregClassificationNum,
          deregistration_registry_number: deregRegistryNum,
          deregistration_data_entered_at: new Date().toISOString(),
          deregistration_data_entered_by: user?.id
        })
      });

      if (response.ok) {
        toast.success('Klasifikacijske oznake odjave spremljene. workflow uspješno završen.');
        setShowDeregisterClassifyModal(false);
        setDeregClassifyingApp(null);
        setDeregClassificationNum('');
        setDeregRegistryNum('');
        fetchTeacherData();
      } else {
        throw new Error('Save deregistration classifications failed');
      }
    } catch (err) {
      toast.error('Greška pri spremanju klasifikacijskih oznaka odjave.');
    }
  };

  // Filters logic
  // tab logic
  let filtered = applications;
  if (activeTab === 'mentorship') {
    filtered = applications.filter(app => app.mentor_id === user?.id);
  } else if (activeTab === 'class') {
    filtered = applications.filter(app => app.class_id === selectedClassId);
  } else if (activeTab === 'all') {
    if (!isSchoolAdmin) {
      // Just in case non-admin tries to click, restrict
      filtered = applications.filter(app => app.mentor_id === user?.id || app.class_id === selectedClassId);
    }
  }

  // search term filter
  if (searchTerm.trim()) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(app => {
      const studentName = students.find(s => s.id === app.student_id)?.name || '';
      const mentorName = mentors.find(m => m.id === app.mentor_id)?.name || '';
      const className = classes.find(c => c.id === app.class_id)?.name || '';
      return (
        app.thesis_title.toLowerCase().includes(term) ||
        studentName.toLowerCase().includes(term) ||
        mentorName.toLowerCase().includes(term) ||
        className.toLowerCase().includes(term)
      );
    });
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CREATED':
        return <span className="px-2 py-0.5 text-[10px] font-black bg-blue-100 text-blue-800 rounded">PODNESENO</span>;
      case 'ACCEPTED':
        return <span className="px-2 py-0.5 text-[10px] font-black bg-emerald-100 text-emerald-800 rounded">PRIHVAĆENO</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 text-[10px] font-black bg-rose-100 text-rose-800 rounded">ODBIJENO</span>;
      case 'DEREGISTERED':
        return <span className="px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 rounded">ODJAVLJENO</span>;
      case 'COMPLETED':
        return <span className="px-2 py-0.5 text-[10px] font-black bg-indigo-100 text-indigo-800 rounded">DOVRŠENO</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-black bg-gray-100 text-gray-800 rounded">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center font-sans text-gray-500">
        Učitavanje podataka za mentore i razrednike...
      </div>
    );
  }

  if (!canAccessClass) {
      return (
         <div className="p-8 flex flex-col items-center justify-center font-sans">
             <div className="border-l-4 border-red-500 p-6 bg-red-50 w-full max-w-2xl rounded shadow-sm flex flex-col items-center text-center">
                 <ShieldAlert className="text-red-500 mb-2" size={32} />
                 <h2 className="text-lg font-black text-red-800 uppercase tracking-wider">Završni radovi nedostupni</h2>
                 <p className="text-red-700 font-semibold mt-2">
                     Administracija završnih radova dostupna je samo za završne razrede programa (ovisno o trajanju odabranog programa: 3. ili 4. razred).
                 </p>
                 <p className="text-xs text-red-600 mt-2">
                     Provjerite je li u administraciji razreda ispravno odabran program.
                 </p>
             </div>
         </div>
      );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-sans">
      <div className="border-b border-gray-200 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tight">Pregled i odobrenje završnih radova</h1>
          <p className="text-xs text-gray-500 font-bold uppercase mt-1">Sustav mentorstava i klasifikacije prijavnica završnog rada</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('mentorship')}
            className={`px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition-all border ${
              activeTab === 'mentorship' 
                ? 'bg-[#005c8d] text-white border-[#005c8d] shadow-sm' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Moje mentorstvo ({applications.filter(app => app.mentor_id === user?.id).length})
          </button>

          {selectedClassId && (
            <button
              onClick={() => setActiveTab('class')}
              className={`px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition-all border ${
                activeTab === 'class' 
                  ? 'bg-[#005c8d] text-white border-[#005c8d] shadow-sm' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Učenici razreda ({applications.filter(app => app.class_id === selectedClassId).length})
            </button>
          )}

          {isSchoolAdmin && (
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition-all border ${
                activeTab === 'all' 
                  ? 'bg-[#005c8d] text-white border-[#005c8d] shadow-sm' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Sve prijave škole ({applications.length})
            </button>
          )}

          <button
            onClick={() => setActiveTab('archive')}
            className={`px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition-all border ${
              activeTab === 'archive' 
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            📂 Arhiva završnih radova ({applications.filter(app => app.status === 'COMPLETED' || app.final_grade || app.defense_grade).length})
          </button>

          <button
            onClick={() => setActiveTab('defense')}
            className={`px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition-all border ${
              activeTab === 'defense' 
                ? 'bg-[#005c8d] text-white border-[#005c8d] shadow-sm' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            RASPORED OBRANE
          </button>
        </div>
      </div>

      {/* Control bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Pretraga po učeniku, mentoru, razredu ili naslovu..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-xs font-semibold focus:outline-[#005c8d]"
          />
        </div>

        <div className="text-xs text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3/5 py-1.5 rounded">
          <Filter size={12} />
          Prikazano: {filtered.length} od {applications.length} prijava
        </div>
      </div>

      {/* Tab Conditional Rendering */}
      {activeTab === 'archive' ? (
        <div className="bg-white rounded-lg border border-slate-205 overflow-hidden shadow-sm p-6 space-y-4">
          <div className="border-b pb-2 flex justify-between items-center bg-slate-50 p-4 -m-6 mb-4">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase">Službeni arhiv dovršenih obrana</h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase">Pretraživanje, kontrola svjedodžbi i povijesni upis</p>
            </div>
            <span className="text-[10px] bg-slate-200 text-slate-800 font-black uppercase px-2 py-1 rounded">
              Zatvorene Klase
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 uppercase font-black">
                  <th className="p-4">Učenik</th>
                  <th className="p-4">Tema završnog rada</th>
                  <th className="p-4">Mentor i povjerenstvo</th>
                  <th className="p-4 text-center">Ocjena izradbe</th>
                  <th className="p-4 text-center">Ocjena usmene obrane</th>
                  <th className="p-4 text-center">Konačna ocjena (Završna svjedodžba)</th>
                  <th className="p-4 text-right">Zapisnik</th>
                </tr>
              </thead>
              <tbody>
                {applications.filter(app => app.status === 'COMPLETED' || app.final_grade || app.defense_grade).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-430 italic font-semibold">
                      Još nema unesenih završenih niti ocijenjenih radova u arhivu.
                    </td>
                  </tr>
                ) : (
                  applications
                    .filter(app => app.status === 'COMPLETED' || app.final_grade || app.defense_grade)
                    .map((app) => {
                      const student = students.find(s => s.id === app.student_id);
                      const schoolClass = classes.find(c => c.id === app.class_id);
                      const mentor = mentors.find(m => m.id === app.mentor_id);

                      return (
                        <tr key={app.id} className="border-b border-gray-100 hover:bg-slate-50/40">
                          <td className="p-4">
                            <div className="font-extrabold text-slate-950 text-sm leading-none">{student?.name || 'Nepoznat učenik'}</div>
                            <div className="text-[9.5px] uppercase font-bold text-slate-400 mt-1">Razred: {schoolClass?.name || '—'}</div>
                          </td>
                          <td className="p-4 font-semibold text-slate-800">
                            {app.thesis_title}
                          </td>
                          <td className="p-4 font-medium text-slate-700">
                            <div className="font-bold text-xs">Mentor: {mentor?.name || '—'}</div>
                            {(app as any).defense_committee && (
                              <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">Povjerenstvo: {(app as any).defense_committee}</div>
                            )}
                          </td>
                          <td className="p-4 text-center font-extrabold text-slate-850 text-sm">
                            {app.creation_grade || '—'}
                          </td>
                          <td className="p-4 text-center font-extrabold text-slate-850 text-sm">
                            {app.defense_grade || '—'}
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-xs font-black uppercase px-2.5 py-1 rounded inline-block bg-slate-900 text-white">
                              Ocjena: {app.final_grade || 'Nije ocijenjeno'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => {
                                toast.success(`Službena svjedodžba za učenika ${student?.name} pripremljena za ispis.`);
                              }}
                              className="bg-slate-100 text-slate-800 px-3 py-1.5 rounded hover:bg-slate-205 text-[10px] uppercase font-black tracking-wide inline-flex items-center gap-1 w-fit"
                            >
                              🖨️ Svjedodžba
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'defense' ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Raspored obrane</h3>
            {isSchoolAdmin && (
              <button 
                onClick={() => {
                  console.log("ADD DEFENSE SCHEDULE CLICKED");
                  setIsDefenseScheduleModalOpen(true);
                }}
                className="px-3 py-1.5 bg-[#005c8d] text-white text-xs font-bold rounded hover:bg-[#004a70]"
              >
                Dodaj raspored
              </button>
            )}
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-gray-500 uppercase bg-gray-50">
              <tr>
                <th className="px-4 py-3">Razred</th>
                <th className="px-4 py-3">Komisija</th>
                <th className="px-4 py-3">Razrednik</th>
                <th className="px-4 py-3">Vrijeme</th>
                <th className="px-4 py-3">Učionica</th>
                {isSchoolAdmin && <th className="px-4 py-3 text-right">Akcije</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(() => {
                const visibleSchedules = isSchoolAdmin
                  ? defenseSchedules
                  : defenseSchedules.filter(s => (s.members || []).some((m: any) => m.teacher_profile_id === user?.id));

                if (visibleSchedules.length === 0) {
                  return (
                    <tr>
                      <td colSpan={isSchoolAdmin ? 6 : 5} className="px-4 py-4 text-center text-gray-400 font-semibold italic">Nema rasporeda za odabranu školu.</td>
                    </tr>
                  );
                }

                return visibleSchedules.map(s => {
                  const clazz = classes.find(c => c.id === s.class_id);
                  const homeroomId = (s.members || []).find((m: any) => m.is_homeroom_teacher)?.teacher_profile_id || clazz?.homeroom_teacher_id;
                  const hrTeacher = mentors.find(t => t.id === homeroomId);
                  const commissionNames = Array.from(new Set((s.members || []).map((m: any) => mentors.find(t => t.id === m.teacher_profile_id)?.name))).filter(Boolean);
                  const commission = commissionNames.join(', ');
                  const formattedTime = s.defense_time ? s.defense_time.substring(0, 5) : '—';
                  
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-black text-gray-900">{clazz?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 font-medium">{commission || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 font-semibold">{hrTeacher?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono">{formattedTime}</td>
                      <td className="px-4 py-3 text-gray-600 font-bold bg-slate-50">{s.classroom}</td>
                      {isSchoolAdmin && (
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => setEditDefenseSchedule(s)}
                            className="text-[#005c8d] hover:text-blue-800 font-semibold transition-colors"
                          >
                            Uredi
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              console.log("DEBUG: DEFENSE BUTTON CLICKED", s.id);
                              handleDeleteDefenseSchedule(s.id, clazz?.name);
                            }}
                            className="text-red-500 hover:text-red-700 font-semibold transition-colors ml-2"
                          >
                            Obriši
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                });
              })()}
            </tbody>
          </table>
        </div>
      ) : (
        /* Main Table */
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 italic font-semibold text-xs py-14">
            Nema prijavljenih završnih radova za odabrani filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-400 uppercase font-black">
                  <th className="p-4">Učenik i razred</th>
                  <th className="p-4">Naslov završnog rada</th>
                  <th className="p-4">Mentor</th>
                  <th className="p-4">Rok obrane</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Klasa i Urbroj prijemnice</th>
                  <th className="p-4">Klasa i Urbroj odjavnice</th>
                  <th className="p-4 text-right">Akcije</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => {
                  const student = students.find(s => s.id === app.student_id);
                  const schoolClass = classes.find(c => c.id === app.class_id);
                  const mentor = mentors.find(m => m.id === app.mentor_id);

                  return (
                    <tr key={app.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-gray-900 text-sm leading-none">{student?.name || 'Nepoznat učenik'}</div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Razred: {schoolClass?.name || '—'}</div>
                      </td>
                      <td className="p-4 max-w-xs">
                        <div className="font-semibold text-gray-800 leading-normal">{app.thesis_title}</div>
                        {app.student_note && (
                          <div className="text-[10px] text-gray-400 italic mt-1 line-clamp-1 truncate" title={app.student_note}>
                            Napomena: {app.student_note}
                          </div>
                        )}
                        {/* Student-uploaded versions list with digital download hooks */}
                        {(app as any).versions && (app as any).versions.length > 0 && (
                          <div className="mt-2 space-y-1 bg-slate-50 border border-dashed rounded p-3 text-[10px]">
                            <span className="font-extrabold uppercase text-slate-400 block mb-1">📂 Predane verzije rada:</span>
                            {(app as any).versions.map((ver: any, verIdx: number) => (
                              <div key={verIdx} className="flex items-center justify-between gap-2 border-b border-slate-100 last:border-b-0 py-1">
                                <span className="font-bold text-slate-800">v{ver.version_num}: {ver.filename} {((app as any).submission_confirmed && ver.version_num === (app as any).versions.length) ? '🔒(Konačna)' : ''}</span>
                                <button 
                                  onClick={async () => {
                                    if (user?.id) {
                                      await logSystemAction({
                                        executor_id: user.id,
                                        school_id: selectedSchoolId || 'N/A',
                                        action_type: 'DOWNLOAD_STUDENT_THESIS_PDF',
                                        entity_type: 'FINAL_THESIS',
                                        entity_id: app.id,
                                        new_value: { version: ver.version_num, filename: ver.filename, student: student?.name }
                                      });
                                    }
                                    toast.success(`Preuzimanje datoteke ${ver.filename}...`);
                                  }}
                                  className="text-[#005c8d] hover:underline font-extrabold cursor-pointer"
                                >
                                  Preuzmi PDF
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-semibold text-gray-600">
                        {mentor?.name || '—'}
                      </td>
                      <td className="p-4 font-semibold text-gray-600">
                        {app.exam_period} rok
                      </td>
                      <td className="p-4">
                        {getStatusBadge(app.status)}
                      </td>
                      <td className="p-4 font-mono text-gray-500 text-[11px]">
                        {app.application_classification_number ? (
                          <div className="leading-tight">
                            <span className="font-bold text-emerald-800">{app.application_classification_number}</span> <br />
                            <span className="text-gray-400">{app.application_registry_number}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="p-4 font-mono text-gray-500 text-[11px]">
                        {app.deregistration_classification_number ? (
                          <div className="leading-tight">
                            <span className="font-bold text-amber-800">{app.deregistration_classification_number}</span> <br />
                            <span className="text-gray-400">{app.deregistration_registry_number}</span>
                          </div>
                        ) : (
                          app.deregistration_note ? (
                            <div className="text-red-700 italic text-[10px] leading-none" title={app.deregistration_note}>
                              Zahtjev: {app.deregistration_note}
                            </div>
                          ) : '—'
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Defense calendaring schedule button */}
                          {app.status === 'ACCEPTED' && (
                            <button
                              onClick={() => {
                                setDefensingApp(app);
                                setDefDate(app.defense_date || '');
                                setDefTime((app as any).defense_time || '09:00');
                                setDefClassroom((app as any).defense_classroom || '');
                                setDefCommittee((app as any).defense_committee || '');
                                setShowDefenseModal(true);
                              }}
                              className="p-1 px-2.5 bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white rounded font-black uppercase text-[9px] flex items-center gap-0.5 transition-colors"
                              title="Rasporedi obranu"
                            >
                              🗓️ Rasporedi obranu
                            </button>
                          )}

                          {/* Mentor can approve or reject newly submitted ones */}
                          {app.status === 'CREATED' && (app.mentor_id === user?.id || isSchoolAdmin) && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(app.id, 'ACCEPTED')}
                                className="p-1 px-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-black uppercase text-[9px] flex items-center gap-0.5 transition-colors border border-emerald-200"
                                title="Prihvati prijavu"
                              >
                                <Check size={10} /> Prihvati
                              </button>
                              <button
                                onClick={() => {
                                  setGradingApp(app);
                                  setShowGradingModal(true);
                                }}
                                className="p-1 px-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded font-black uppercase text-[9px] flex items-center gap-0.5 transition-colors border border-blue-200"
                                title="Ocijeni rad"
                              >
                                <GraduationCap size={10} /> Ocjeni
                              </button>
                              <button
                                onClick={() => {
                                  setRejectingApp(app);
                                  setRejectionNote('');
                                  setShowRejectModal(true);
                                }}
                                className="p-1 px-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded font-black uppercase text-[9px] flex items-center gap-0.5 transition-colors border border-rose-200"
                                title="Odbij prijavu"
                              >
                                <X size={10} /> Odbij
                              </button>
                            </>
                          )}

                          {/* Mentor or Admin enters registration data */}
                          {app.status === 'ACCEPTED' && (app.mentor_id === user?.id || isSchoolAdmin) && (
                            <button
                              onClick={() => {
                                setClassifyingApp(app);
                                setClassificationNum(app.application_classification_number || '');
                                setRegistryNum(app.application_registry_number || '');
                                setShowClassifyModal(true);
                              }}
                              className="p-1 px-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded font-black uppercase text-[9px] flex items-center gap-0.5 transition-colors border border-blue-200"
                              title="Zavedi Urudžbene brojeve prijavnice"
                            >
                              <FileEdit size={10} /> Urudžbene oznake
                            </button>
                          )}

                          {/* Deregistration workflow */}
                          {app.status === 'DEREGISTERED' && (app.mentor_id === user?.id || isSchoolAdmin) && (
                            <button
                              onClick={() => {
                                setDeregClassifyingApp(app);
                                setDeregClassificationNum(app.deregistration_classification_number || '');
                                setDeregRegistryNum(app.deregistration_registry_number || '');
                                setShowDeregisterClassifyModal(true);
                              }}
                              className="p-1 px-2.5 bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 rounded font-black uppercase text-[9px] flex items-center gap-1 transition-colors"
                              title="Odobri i zavedi Urudžbene oznake rješenja o odjavi"
                            >
                              <UserCheck size={10} /> Rješenje odjave
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

      {/* Classify application modal */}
      {showClassifyModal && classifyingApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-gray-800 uppercase tracking-tight mb-2">Urudžbene oznake prijavnice</h3>
            <p className="text-xs text-gray-500 mb-4">
              Zavesti klasu i urudžbeni broj za prijavu učenika <strong>{students.find(s => s.id === classifyingApp.student_id)?.name}</strong>
            </p>

            <form onSubmit={handleClassificationSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-1">Klasa</label>
                <input
                  type="text"
                  required
                  placeholder="Npr. 602-03/24-03/1"
                  value={classificationNum}
                  onChange={(e) => setClassificationNum(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-1">Urudžbeni broj</label>
                <input
                  type="text"
                  required
                  placeholder="Npr. 251-300-01-24-3-3"
                  value={registryNum}
                  onChange={(e) => setRegistryNum(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowClassifyModal(false);
                    setClassifyingApp(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-xs font-black uppercase tracking-wider"
                >
                  Zatvori
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-black uppercase tracking-wider hover:bg-blue-700"
                >
                  Spremi oznake
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deregister Classify modal */}
      {showDeregisterClassifyModal && deregClassifyingApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" id="dereg-classify-modal">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-gray-800 uppercase tracking-tight mb-2">Oznaka za Rješenje o odjavi</h3>
            <p className="text-xs text-gray-500 mb-4">
              Izdati rješenje o odjavi i unijeti klasifikacijske oznake rješenja za učenika <strong>{students.find(s => s.id === deregClassifyingApp.student_id)?.name}</strong>
            </p>

            <div className="bg-red-50 p-3 rounded text-xs border border-red-100 text-red-800 italic mb-4 leading-normal">
              <strong>Razlog odjave od strane učenika:</strong> <br />
              "{deregClassifyingApp.deregistration_note}"
            </div>

            <form onSubmit={handleDeregClassificationSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-1">Klasa rješenja o odjavi</label>
                <input
                  type="text"
                  required
                  placeholder="Npr. 602-03/24-03/2"
                  value={deregClassificationNum}
                  onChange={(e) => setDeregClassificationNum(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-1">Urudžbeni broj rješenja o odjavi</label>
                <input
                  type="text"
                  required
                  placeholder="Npr. 251-300-01-24-3-4"
                  value={deregRegistryNum}
                  onChange={(e) => setDeregRegistryNum(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeregisterClassifyModal(false);
                    setDeregClassifyingApp(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-xs font-black uppercase tracking-wider"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white rounded text-xs font-black uppercase tracking-wider hover:bg-amber-700"
                >
                  Odobri odjavu i spremi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject application modal */}
      {showRejectModal && rejectingApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-gray-800 uppercase tracking-tight mb-2">Odbijanje prijave završnog rada</h3>
            <p className="text-xs text-gray-500 mb-4">
              Unesite razlog za odbijanje prijave učenika <strong>{students.find(s => s.id === rejectingApp.student_id)?.name}</strong> za rad s naslovom <em>"{rejectingApp.thesis_title}"</em>.
            </p>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-1">Razlog odbijanja</label>
                <textarea
                  required
                  placeholder="Npr. Tema nije odobrena od strane stručnog vijeća..."
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d] h-24 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectingApp(null);
                    setRejectionNote('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-xs font-black uppercase tracking-wider"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 text-white rounded text-xs font-black uppercase tracking-wider hover:bg-rose-700"
                >
                  Odbij prijavu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grading application modal */}
      {showGradingModal && gradingApp && (
        <ThesisGradingModal
          app={gradingApp}
          students={students}
          onClose={() => {
            setShowGradingModal(false);
            setGradingApp(null);
          }}
          onSubmit={handleGradingSubmit}
        />
      )}

      {/* Raspored obrane modal */}
      {showDefenseModal && defensingApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-gray-800 uppercase tracking-tight mb-2">🗓️ Rasporedi termin obrane završnog rada</h3>
            <p className="text-xs text-gray-500 mb-4">
              Učenik: <strong>{students.find(s => s.id === defensingApp.student_id)?.name}</strong> <br />
              Tema: <em>"{defensingApp.thesis_title}"</em>
            </p>

            <form onSubmit={handleDefenseSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Datum obrane</label>
                  <input
                    type="date"
                    required
                    value={defDate}
                    onChange={(e) => setDefDate(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Vrijeme obrane</label>
                  <input
                    type="time"
                    required
                    value={defTime}
                    onChange={(e) => setDefTime(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Učionica / Dvorana</label>
                <input
                  type="text"
                  required
                  placeholder="Npr. Učionica kemije 105, amfiteatar..."
                  value={defClassroom}
                  onChange={(e) => setDefClassroom(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Ispitno Povjerenstvo (Imena članova)</label>
                <input
                  type="text"
                  required
                  placeholder="Npr. Ivana Horvat (predsj.), Marko Kovač (član)..."
                  value={defCommittee}
                  onChange={(e) => setDefCommittee(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded focus:outline-[#005c8d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDefenseModal(false);
                    setDefensingApp(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-xs font-black uppercase tracking-wider"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-black uppercase tracking-wider"
                >
                  Spremi Raspored
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(isDefenseScheduleModalOpen || editDefenseSchedule) && selectedSchoolId && (
        <FinalExamDefenseScheduleModal
          onClose={() => {
            setIsDefenseScheduleModalOpen(false);
            setEditDefenseSchedule(null);
          }}
          onSaved={() => {
            setIsDefenseScheduleModalOpen(false);
            setEditDefenseSchedule(null);
            fetchDefenseSchedules();
          }}
          classes={classes}
          mentors={mentors}
          schoolId={selectedSchoolId}
          initialData={editDefenseSchedule}
        />
      )}
    </div>
  );
}
