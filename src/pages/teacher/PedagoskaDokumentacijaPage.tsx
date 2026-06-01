import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { mappers } from '../../lib/mappers';
import { usePageTitle } from '../../hooks/usePageTitle';
import { 
  Users, BookOpen, Heart, ShieldAlert, Edit2, Plus, Trash2, 
  Save, X, FileText, User, Calendar, MessageSquare, AlertCircle, FileSpreadsheet, GraduationCap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { sortStudentsBySurname } from '../../lib/utils';

interface StudentPedagogicalProfile {
  student_id: string;
  education_program: string;
  visit_reason: string;
  disabilities: string;
  accommodations: string;
  support_types: string;
  practical_training: string;
  documentation: string;
  program_adjustment?: string;
}

interface LogEntry {
  id: string;
  recordType: 'Mišljenje pedagoga' | 'Mišljenje psihologa' | 'Mišljenje defektologa' | 'Razgovor s učenikom' | 'Razgovor s roditeljima' | 'Opća zabilješka';
  interviewDate: string;
  interviewerName: string;
  problemDescription: string;
  measuresTaken: string;
  confidentialNotes: string;
  updatedAt: string;
}

interface StudentPedagogicalYearNotes {
  student_id: string;
  class_id: string;
  school_year_id: string;
  recommendations: string; // Serialized JSON { teacher: string, parent: string }
  counselor_notes: string;
  yearly_observations: LogEntry[];
}

export default function PedagoskaDokumentacijaPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, userSchoolRoles } = useAuth();
  const { selectedClassId } = useSelection();

  const effectiveClassId = classId || selectedClassId;

  // State
  const [loading, setLoading] = useState(true);
  const [activeClass, setActiveClass] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  usePageTitle(selectedStudent ? `Pedagoška dokumentacija - ${selectedStudent.name}` : "Pedagoška dokumentacija");

  // Decoupled Pedagogical State
  const [profile, setProfile] = useState<StudentPedagogicalProfile>({
    student_id: '',
    education_program: '',
    visit_reason: '',
    disabilities: '',
    accommodations: '',
    support_types: '',
    practical_training: '',
    documentation: '',
    program_adjustment: ''
  });

  const [yearNotes, setYearNotes] = useState<StudentPedagogicalYearNotes>({
    student_id: '',
    class_id: '',
    school_year_id: '',
    recommendations: '',
    counselor_notes: '',
    yearly_observations: []
  });

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'CARD' | 'RECOMMENDATIONS' | 'ENTRY' | 'POMOC_EDIT' | 'TESKOCE_EDIT' | 'DOKUMENTI_EDIT' | 'PRAKTICNA_EDIT'>('ENTRY');
  
  // Forms Temp State
  const [editProfileForm, setEditProfileForm] = useState<StudentPedagogicalProfile | null>(null);
  const [editRecsForm, setEditRecsForm] = useState<{ teacher: string; parent: string }>({ teacher: '', parent: '' });
  const [editLogEntryForm, setEditLogEntryForm] = useState<Partial<LogEntry> | null>(null);
  const [editSingleTextField, setEditSingleTextField] = useState<{ fieldName: string; title: string; value: string }>({ fieldName: '', title: '', value: '' });

  // Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState<string>('INFO');

  // Delete Dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    entry: LogEntry | null;
    loading: boolean;
  }>({
    isOpen: false,
    entry: null,
    loading: false
  });

  // Permissions Check (Stručna služba, ravnatelj, administracija)
  const roles = userSchoolRoles.map(r => r.role);
  const hasFullAccess = React.useMemo(() => {
    const isSpecialPrivileged = isMainAdmin || roles.some(r => [
      'MAIN_ADMIN', 
      'ADMIN', 
      'SCHOOL_ADMIN', 
      'HOMEROOM', 
      'DEPUTY',
      'PEDAGOG', 
      'PSIHOLOG', 
      'REHABILITATOR', 
      'SOCIJALNI_PEDAGOG', 
      'RAVNATELJ'
    ].includes(r as any));
    
    const emailMatches = user?.email?.toLowerCase().includes('pedagog') ||
                         user?.email?.toLowerCase().includes('psiholog') ||
                         user?.email?.toLowerCase().includes('ravnatelj');
                         
    const nameMatches = user?.name?.toLowerCase().includes('pedagog') ||
                        user?.name?.toLowerCase().includes('psiholog');

    return isSpecialPrivileged || emailMatches || nameMatches;
  }, [isMainAdmin, roles, user]);

  // Load class on mount or context change
  useEffect(() => {
    if (effectiveClassId) {
      loadClassData(effectiveClassId);
    }
  }, [effectiveClassId]);

  // Log profile when loaded or changed, in accordance with step 4
  useEffect(() => {
    if (profile && profile.student_id) {
      console.log("LOAD PEDAGOGICAL PROFILE", profile);
      console.log("LOADED PROGRAM ADJUSTMENT", profile.program_adjustment);
    }
  }, [profile]);

  const loadClassData = async (cId: string) => {
    setLoading(true);
    try {
      // 1. Fetch Class
      const { data: rawClass, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', cId)
        .maybeSingle();

      if (classError || !rawClass) {
        throw new Error("Class not found");
      }

      const mappedClass = mappers.class(rawClass);
      setActiveClass(mappedClass);

      // 2. Fetch Students
      const { data: enrollData, error: enrollError } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(*)')
        .eq('class_id', cId)
        .eq('status', 'ACTIVE');
      
      if (enrollError) throw enrollError;

      const studentsList = (enrollData || []).map((e: any) => mappers.user(e.student)).filter(Boolean);
      const uniqueStudents = Array.from(new Map(studentsList.map(s => [s.id, s])).values());
      const sortedStudents = sortStudentsBySurname(uniqueStudents);
      setStudents(sortedStudents);

      // 3. Selection default
      if (sortedStudents.length > 0) {
        setSelectedStudent(sortedStudents[0]);
        loadStudentPedagogicalData(sortedStudents[0].id, cId, mappedClass.school_year_id);
      } else {
        setSelectedStudent(null);
        resetPedagogicalState();
      }
    } catch (e: any) {
      console.error("Error loading pedagogical records", e);
      toast.error("Greška pri učitavanju podataka razreda.");
    } finally {
      setLoading(false);
    }
  };

  const resetPedagogicalState = () => {
    setProfile({
      student_id: '',
      education_program: '',
      visit_reason: '',
      disabilities: '',
      accommodations: '',
      support_types: '',
      practical_training: '',
      documentation: '',
      program_adjustment: ''
    });
    setYearNotes({
      student_id: '',
      class_id: '',
      school_year_id: '',
      recommendations: '',
      counselor_notes: '',
      yearly_observations: []
    });
  };

  const loadStudentPedagogicalData = async (studentId: string, cId: string, syId: string) => {
    try {
      // A. Load permanent Profile
      const profileRes = await fetch(`/api/student-pedagogical-profile?studentId=${studentId}`);
      if (profileRes.ok) {
        const profData = await profileRes.json();
        setProfile(profData);
        const profile = profData;
        console.log("LOAD PEDAGOGICAL PROFILE", profile);
        console.log("LOADED PROGRAM ADJUSTMENT", profile?.program_adjustment);
      }

      // B. Load yearly Notes
      const notesRes = await fetch(`/api/student-pedagogical-year-notes?studentId=${studentId}&classId=${cId}&schoolYearId=${syId}`);
      if (notesRes.ok) {
        const yearData = await notesRes.json();
        setYearNotes(yearData);
      }
    } catch (err) {
      console.error("Failed to fetch pedagogical datasets for student", err);
      resetPedagogicalState();
    }
  };

  const handleStudentSelect = (student: any) => {
    setSelectedStudent(student);
    if (activeClass) {
      loadStudentPedagogicalData(student.id, activeClass.id, activeClass.school_year_id);
    }
    setActiveSubTab('INFO');
  };

  // Recommendations split parser
  const getRecommendationsObj = () => {
    let recs = { teacher: '', parent: '' };
    try {
      recs = JSON.parse(yearNotes.recommendations || '{}');
      if (typeof recs !== 'object' || !recs) {
        recs = { teacher: yearNotes.recommendations || '', parent: '' };
      }
    } catch {
      recs = { teacher: yearNotes.recommendations || '', parent: '' };
    }
    return recs;
  };

  // EDIT OPERATORS
  const handleEditBasicCard = () => {
    setEditProfileForm({ 
      ...profile,
      programAdjustment: profile.program_adjustment || selectedStudent?.programAdjustment || 'NONE'
    } as any);
    setModalType('CARD');
    setShowModal(true);
  };

  const handleEditRecommendations = () => {
    setEditRecsForm(getRecommendationsObj());
    setModalType('RECOMMENDATIONS');
    setShowModal(true);
  };

  const handleEditSingleField = (fieldName: keyof StudentPedagogicalProfile, title: string) => {
    setEditSingleTextField({
      fieldName,
      title,
      value: profile[fieldName] || ''
    });
    setModalType(
      fieldName === 'support_types' ? 'POMOC_EDIT' :
      fieldName === 'disabilities' ? 'TESKOCE_EDIT' :
      fieldName === 'documentation' ? 'DOKUMENTI_EDIT' : 'PRAKTICNA_EDIT'
    );
    setShowModal(true);
  };

  const handleAddLogEntry = () => {
    let initType: any = 'Opća zabilješka';
    if (activeSubTab === 'BILJESKE') initType = 'Mišljenje pedagoga';
    if (activeSubTab === 'UCENIK') initType = 'Razgovor s učenikom';
    if (activeSubTab === 'RODITELJI') initType = 'Razgovor s roditeljima';

    setEditLogEntryForm({
      id: '',
      recordType: initType,
      interviewDate: new Date().toISOString().split('T')[0],
      interviewerName: user?.name || '',
      problemDescription: '',
      measuresTaken: '',
      confidentialNotes: ''
    });
    setModalType('ENTRY');
    setShowModal(true);
  };

  const handleEditLogEntry = (entry: LogEntry) => {
    setEditLogEntryForm({ ...entry });
    setModalType('ENTRY');
    setShowModal(true);
  };

  const handleDeleteLogEntry = (entry: LogEntry) => {
    setDeleteDialog({
      isOpen: true,
      entry,
      loading: false
    });
  };

  const confirmDeleteLogEntry = async () => {
    const entry = deleteDialog.entry;
    if (!entry || !selectedStudent || !activeClass) return;

    setDeleteDialog(prev => ({ ...prev, loading: true }));
    try {
      const updatedObservations = yearNotes.yearly_observations.filter(o => o.id !== entry.id);
      
      const response = await fetch('/api/student-pedagogical-year-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          classId: activeClass.id,
          schoolYearId: activeClass.school_year_id,
          recommendations: yearNotes.recommendations,
          counselor_notes: yearNotes.counselor_notes,
          yearly_observations: updatedObservations
        })
      });

      if (response.ok) {
        toast.success("Bilješka uspješno izbrisana.");
        setYearNotes(prev => ({ ...prev, yearly_observations: updatedObservations }));
        setDeleteDialog({ isOpen: false, entry: null, loading: false });
      } else {
        throw new Error("API Save failure");
      }
    } catch (err) {
      toast.error("Neuspjelo brisanje bilješke.");
      setDeleteDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // SAVE MODAL HANDLER
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !activeClass) return;

    try {
      // 1. SAVE PROFILE (CARD & PERSONAL TEXTS)
      if (modalType === 'CARD' && editProfileForm) {
        const valAdjustment = (editProfileForm as any).programAdjustment || 'NONE';
        const programAdjustment = valAdjustment;

        let response: Response;
        let dbProfileUpdate: any;

        try {
          const [resUpdate, dbUpdate] = await Promise.all([
            fetch('/api/student-pedagogical-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studentId: selectedStudent.id,
                education_program: editProfileForm.education_program,
                visit_reason: editProfileForm.visit_reason,
                disabilities: editProfileForm.disabilities,
                accommodations: editProfileForm.accommodations,
                support_types: editProfileForm.support_types,
                practical_training: editProfileForm.practical_training,
                documentation: editProfileForm.documentation,
                program_adjustment: valAdjustment
              })
            }),
            supabase
              .from('user_profiles')
              .update({ program_adjustment: valAdjustment })
              .eq('id', selectedStudent.id)
          ]);
          response = resUpdate;
          dbProfileUpdate = dbUpdate;
        } catch (err: any) {
          console.log("SAVE PROGRAM ADJUSTMENT studentId", selectedStudent.id);
          console.log("SAVE PROGRAM ADJUSTMENT value", programAdjustment);
          console.log("SAVE PROGRAM ADJUSTMENT result", null, err);
          throw err;
        }

        if (dbProfileUpdate && dbProfileUpdate.error) {
          console.error("Failed to update program adjustment in user_profiles", dbProfileUpdate.error);
        }

        if (response.ok) {
          const freshProfile = await response.json();
          setProfile(freshProfile);
          
          const data = freshProfile;
          const error = null;
          console.log("SAVE PROGRAM ADJUSTMENT studentId", selectedStudent.id);
          console.log("SAVE PROGRAM ADJUSTMENT value", programAdjustment);
          console.log("SAVE PROGRAM ADJUSTMENT result", data, error);

          // Refresh client states immediately
          setSelectedStudent(prev => prev ? { ...prev, programAdjustment: valAdjustment } : null);
          setStudents(prev => prev.map(s => s.id === selectedStudent.id ? { ...s, programAdjustment: valAdjustment } : s));

          // 3. Complete actual refetch from the API / Supabase
          await loadClassData(activeClass.id);
          await loadStudentPedagogicalData(selectedStudent.id, activeClass.id, activeClass.school_year_id);

          toast.success("Osnovni karton uspješno spremljen.");
          setShowModal(false);
        } else {
          console.log("SAVE PROGRAM ADJUSTMENT studentId", selectedStudent.id);
          console.log("SAVE PROGRAM ADJUSTMENT value", programAdjustment);
          console.log("SAVE PROGRAM ADJUSTMENT result", null, new Error("API response error"));
          throw new Error();
        }
      }

      // 2. SAVE INLINE SINGLE PERMANENT FIELDS
      else if (['POMOC_EDIT', 'TESKOCE_EDIT', 'DOKUMENTI_EDIT', 'PRAKTICNA_EDIT'].includes(modalType)) {
        const val = editSingleTextField.value;
        const field = editSingleTextField.fieldName;
        
        const response = await fetch('/api/student-pedagogical-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: selectedStudent.id,
            ...profile,
            [field]: val
          })
        });

        if (response.ok) {
          const freshProfile = await response.json();
          setProfile(freshProfile);
          toast.success("Trajni podaci uspješno ažurirani.");
          setShowModal(false);
        } else throw new Error();
      }

      // 3. SAVE RECOMMENDATIONS (YEAR NOTES)
      else if (modalType === 'RECOMMENDATIONS') {
        const response = await fetch('/api/student-pedagogical-year-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: selectedStudent.id,
            classId: activeClass.id,
            schoolYearId: activeClass.school_year_id,
            recommendations: JSON.stringify(editRecsForm),
            counselor_notes: yearNotes.counselor_notes,
            yearly_observations: yearNotes.yearly_observations
          })
        });

        if (response.ok) {
          const freshNotes = await response.json();
          setYearNotes(freshNotes);
          toast.success("Preporuke za rad uspješno spremljene.");
          setShowModal(false);
        } else throw new Error();
      }

      // 4. SAVE LOG ENTRY (YEAR NOTES)
      else if (modalType === 'ENTRY' && editLogEntryForm) {
        let updatedLogs = [...yearNotes.yearly_observations];
        
        if (editLogEntryForm.id) {
          // Edit existing logs
          updatedLogs = updatedLogs.map(l => l.id === editLogEntryForm.id ? {
            ...l,
            ...editLogEntryForm,
            updatedAt: new Date().toISOString()
          } : l) as LogEntry[];
        } else {
          // Add new log
          const newEntry: LogEntry = {
            id: Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
            recordType: editLogEntryForm.recordType || 'Opća zabilješka',
            interviewDate: editLogEntryForm.interviewDate || new Date().toISOString().split('T')[0],
            interviewerName: editLogEntryForm.interviewerName || user?.name || '',
            problemDescription: editLogEntryForm.problemDescription || '',
            measuresTaken: editLogEntryForm.measuresTaken || '',
            confidentialNotes: editLogEntryForm.confidentialNotes || '',
            updatedAt: new Date().toISOString()
          };
          updatedLogs.push(newEntry);
        }

        const response = await fetch('/api/student-pedagogical-year-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: selectedStudent.id,
            classId: activeClass.id,
            schoolYearId: activeClass.school_year_id,
            recommendations: yearNotes.recommendations,
            counselor_notes: yearNotes.counselor_notes,
            yearly_observations: updatedLogs
          })
        });

        if (response.ok) {
          const freshNotes = await response.json();
          setYearNotes(freshNotes);
          toast.success("Bilješka uspješno spremljena.");
          setShowModal(false);
        } else throw new Error();
      }

    } catch (err) {
      toast.error("Greška pri spremanju podataka.");
    }
  };

  // Get records filtered by category
  const filteredLogEntries = yearNotes.yearly_observations?.filter(rec => {
    if (activeSubTab === 'BILJESKE') {
      return rec.recordType?.includes('Mišljenje') || 
             rec.recordType?.includes('pedagog') || 
             rec.recordType?.includes('psiholog') || 
             rec.recordType?.includes('defektolog') ||
             rec.recordType === 'BILJESKE';
    }
    if (activeSubTab === 'UCENIK') return rec.recordType === 'UCENIK' || rec.recordType?.includes('učenik') || rec.recordType?.includes('učenikom');
    if (activeSubTab === 'RODITELJI') return rec.recordType === 'RODITELJI' || rec.recordType?.includes('roditelj') || rec.recordType?.includes('roditeljima');
    return false;
  }) || [];

  const recsObj = getRecommendationsObj();

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
      {/* Dynamic Header (No manual class selectivity dropdown list) */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 shadow-sm animate-in slide-in-from-top duration-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">PEDAGOŠKA DOKUMENTACIJA</h1>
          <p className="text-xs text-slate-500 font-semibold tracking-tight">Pregled trajnog pedagoškog profila i godišnjih zabilješki stručne službe za aktivni razred</p>
        </div>

        <div className="flex items-center gap-2 bg-[#005c8d]/5 border border-[#005c8d]/15 px-3.5 py-1.5 rounded-full text-xs font-bold text-[#005c8d] shadow-sm uppercase shrink-0">
          <span className="w-1.5 h-1.5 bg-[#005c8d] rounded-full animate-pulse"></span>
          <span>Razred: {activeClass?.name || '...'}</span>
          <span className="mx-1 text-slate-300">|</span>
          <span className="text-slate-500 font-semibold lowercase">godina:</span>
          <span>{activeClass?.schoolYear || '...'}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-20 bg-slate-50">
          <div className="w-10 h-10 border-4 border-[#005c8d] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest animate-pulse">Učitavanje podataka...</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-200 overflow-hidden">
          
          {/* Sastavi popis učenika */}
          <div className="w-full lg:w-80 bg-white flex flex-col shrink-0 overflow-y-auto border-r border-gray-200 shadow-sm">
            <div className="p-4 bg-slate-50/50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider flex items-center gap-2">
                <Users size={14} className="text-slate-500" /> Popis učenika ({students.length})
              </span>
            </div>
            
            {students.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-medium italic">Nema aktivnih učenika u ovom razredu.</div>
            ) : (
              <div className="divide-y divide-gray-100 flex-1">
                {students.map(s => {
                  const isSelected = selectedStudent?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleStudentSelect(s)}
                      className={`w-full text-left p-3.5 flex items-center gap-3.5 transition-all ${
                        isSelected 
                          ? "bg-sky-50/80 font-bold text-[#005c8d] border-l-4 border-[#005c8d] shadow-inner" 
                          : "hover:bg-slate-50/60 border-l-4 border-transparent text-slate-700 hover:text-slate-900"
                      }`}
                    >
                      <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center font-black text-[10px] tracking-wide shrink-0 shadow-sm ${
                        isSelected ? "bg-[#005c8d] text-white" : "bg-slate-100 text-slate-600 border border-slate-200/50"
                      }`}>
                        {s.name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-none truncate">{s.name}</p>
                        <p className="text-[8.5px] text-gray-400 font-black uppercase mt-1 tracking-wider">Karton učenika</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* DOKUMENTACILA MAIN PANEL */}
          {selectedStudent ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 animate-in fade-in duration-300">
              
              {/* STUDENT PROFILE CARD */}
              <div className="p-6 bg-white border-b border-gray-200 shrink-0 shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-13 h-13 bg-sky-50/80 rounded-full flex items-center justify-center text-sky-700 border border-sky-200/50 shadow-sm">
                      <User size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight">{selectedStudent.name}</h2>
                      <div className="flex items-center gap-3 mt-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <span className="bg-slate-100 px-2.5 py-1 text-slate-700 border border-slate-200/60">
                          {activeClass?.name}
                        </span>
                        <span>
                          program: {profile.education_program || 'Nije specificirano'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {hasFullAccess && (
                    <button
                      onClick={handleEditBasicCard}
                      className="px-4 py-2 bg-sky-50 border border-sky-200 text-[#005c8d] hover:bg-sky-100 text-[10px] font-black uppercase tracking-widest rounded shadow-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <Edit2 size={12} /> Uredi osnovni profil
                    </button>
                  )}
                </div>

                {/* Grid details (Decoupled & organized) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 bg-slate-50/50 p-4 border border-gray-200/65 rounded-md text-xs font-bold shadow-inner">
                  <div>
                    <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block mb-1">Program obrazovanja (trajni podatak)</span>
                    <p className="text-slate-800 uppercase tracking-tight">{profile.education_program || '--'}</p>
                  </div>
                  <div>
                    <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block mb-1">Prilagodba programa</span>
                    <p className="text-emerald-700 font-extrabold uppercase tracking-tight">
                      {(profile.program_adjustment === 'REGULAR_WITH_ADAPTATION' || selectedStudent.programAdjustment === 'REGULAR_WITH_ADAPTATION') && "Redovni program uz prilagodbu"}
                      {(profile.program_adjustment === 'REGULAR_WITH_INDIVIDUALIZATION' || selectedStudent.programAdjustment === 'REGULAR_WITH_INDIVIDUALIZATION') && "Redovni program uz individualizaciju"}
                      {(!profile.program_adjustment || profile.program_adjustment === 'NONE') && (!selectedStudent.programAdjustment || selectedStudent.programAdjustment === 'NONE') && "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block mb-1">Teškoće i specifičnosti (trajni podatak)</span>
                    <p className="text-red-700 uppercase tracking-tight">{profile.disabilities || '--'}</p>
                  </div>
                  <div>
                    <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block mb-1">Primarni razlog dolaska / prijave</span>
                    <p className="text-slate-700 italic font-semibold">{profile.visit_reason || '--'}</p>
                  </div>
                </div>
              </div>

              {/* TABS OF MODULE */}
              <div className="bg-white border-b border-gray-200 px-6 flex items-center overflow-x-auto no-scrollbar shrink-0 shadow-sm">
                <button
                  onClick={() => setActiveSubTab('INFO')}
                  className={`px-5 py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                    activeSubTab === 'INFO' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                  }`}
                >
                  <span className="flex items-center gap-1.5"><Heart size={12} /> Preporuke za rad</span>
                </button>

                {hasFullAccess && (
                  <>
                    <button
                      onClick={() => setActiveSubTab('BILJESKE')}
                      className={`px-5 py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'BILJESKE' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><FileText size={12} /> Bilješke stručne službe</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('UCENIK')}
                      className={`px-5 py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'UCENIK' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><User size={12} /> Razgovori s učenikom</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('RODITELJI')}
                      className={`px-5 py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'RODITELJI' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><MessageSquare size={12} /> Razgovori s roditeljima</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('POMOC')}
                      className={`px-5 py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap/80 ${
                        activeSubTab === 'POMOC' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><BookOpen size={12} /> Oblici pomoći (trajno)</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('TESKOCE')}
                      className={`px-5 py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap/80 ${
                        activeSubTab === 'TESKOCE' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><AlertCircle size={12} /> Prilagodbe (trajno)</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('DOKUMENTI')}
                      className={`px-5 py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap/80 ${
                        activeSubTab === 'DOKUMENTI' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><FileSpreadsheet size={12} /> Dokumentacija (trajno)</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('PRAKTICNA')}
                      className={`px-5 py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap/80 ${
                        activeSubTab === 'PRAKTICNA' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><GraduationCap size={12} /> Praksa (trajno)</span>
                    </button>
                  </>
                )}
              </div>

              {/* TABS VIEW CONTROLLER */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                
                {/* 1. INFO TAB - PREPORUKE (YEARLY) */}
                {activeSubTab === 'INFO' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center shrink-0">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Godišnje preporuke u nastavi za tekuću školsku godinu</span>
                      {hasFullAccess && (
                        <button
                          onClick={handleEditRecommendations}
                          className="px-4 py-2 border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-[10px] font-black uppercase tracking-widest rounded shadow-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Edit2 size={11} /> Uredi preporuke
                        </button>
                      )}
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-200/80 p-5 rounded-md shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <Heart className="text-emerald-700" size={16} />
                        <h3 className="text-xs font-black text-emerald-900 uppercase tracking-tight">PREPORUKE ZA RAD S UČENIKOM U RAZREDU</h3>
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed font-semibold bg-white p-4 border border-emerald-100/50 rounded shadow-sm whitespace-pre-wrap">
                        {recsObj.teacher || 'Nema unesenih preporuka za rad s učenikom u razredu za ovu godinu.'}
                      </p>
                    </div>

                    <div className="bg-sky-50 border border-sky-200 p-5 rounded-md shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="text-sky-700" size={16} />
                        <h3 className="text-xs font-black text-sky-900 uppercase tracking-tight">PREPORUKE ZA RODITELJE I PODRŠKU KOD KUĆE</h3>
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed font-semibold bg-white p-4 border border-sky-100/50 rounded shadow-sm whitespace-pre-wrap">
                        {recsObj.parent || 'Nema unesenih preporuka za podršku kod kuće za ovu godinu.'}
                      </p>
                    </div>

                    {!hasFullAccess && (
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded text-xs text-amber-800 font-medium flex items-center gap-2">
                        <ShieldAlert size={16} className="shrink-0 animate-pulse" />
                        <span>Kao nastavnik, imate ovlasti vidjeti isključivo preporuke. Cjelovita pedagoška dijagnostika i povjerljive zabilješke stručnog tima su zaštićene.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. TABOVI S KRONOLOŠKIM ZAPISIMA (BILJEŠKE & RAZGOVORI) (YEARLY DATA in JSON observations) */}
                {['BILJESKE', 'UCENIK', 'RODITELJI'].includes(activeSubTab) && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-3.5 border border-gray-200 rounded shadow-sm">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        Kronološki zapisi stručne službe ({filteredLogEntries.length})
                      </span>
                      <button
                        onClick={handleAddLogEntry}
                        className="bg-[#005c8d] text-white px-4 py-2 hover:bg-[#004a71] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
                      >
                        <Plus size={12} /> Dodaj zapis
                      </button>
                    </div>

                    {filteredLogEntries.length === 0 ? (
                      <div className="bg-white border border-gray-200 rounded-md p-12 text-center shadow-inner">
                        <p className="text-xs text-slate-400 font-bold italic">Nema unesenih zabilješki u ovoj kategoriji za tekuću školsku godinu.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredLogEntries.map((rec) => (
                          <div key={rec.id} className="bg-white border border-gray-200 rounded-md p-5 shadow-sm hover:border-[#005c8d]/50 transition-all duration-200">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3 shrink-0">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center px-2.5 py-1 rounded text-[8.5px] font-black uppercase bg-[#005c8d]/10 text-[#005c8d] border border-[#005c8d]/15">
                                  {rec.recordType}
                                </span>
                                <span className="text-[10px] text-gray-400 font-black uppercase tracking-wide flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  <Calendar size={10} /> {rec.interviewDate}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleEditLogEntry(rec)}
                                  className="p-1.5 text-slate-400 hover:text-sky-600 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200/50 transition-all cursor-pointer"
                                  title="Uredi"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  onClick={() => handleDeleteLogEntry(rec)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200/50 transition-all cursor-pointer"
                                  title="Obriši"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-slate-50/50 p-4 border border-gray-100 rounded text-xs">
                                <h4 className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider mb-2">Zapažanja / Opis problema</h4>
                                <p className="text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">{rec.problemDescription || '--'}</p>
                              </div>

                              <div className="bg-slate-50/50 p-4 border border-gray-100 rounded text-xs">
                                <h4 className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider mb-2">Poduzete mjere / Savjetovanje</h4>
                                <p className="text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">{rec.measuresTaken || '--'}</p>
                              </div>
                            </div>

                            {rec.confidentialNotes && (
                              <div className="mt-4 p-4 border border-rose-100 bg-rose-50/20 rounded-md">
                                <h4 className="text-[8.5px] font-black text-rose-700 uppercase tracking-widest flex items-center gap-1 mb-1.5 border-b border-rose-100/40 pb-1 w-max">
                                  <ShieldAlert size={11} /> Povjerljive zabilješke stručnog tima
                                </h4>
                                <p className="text-xs text-rose-950 font-semibold whitespace-pre-wrap leading-relaxed italic">{rec.confidentialNotes}</p>
                              </div>
                            )}

                            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[8px] text-gray-400 font-black uppercase tracking-widest">
                              <span>Unio/la: {rec.interviewerName || 'Stručna služba'}</span>
                              <span>Zadnja promjena: {rec.updatedAt?.slice(0, 16).replace('T', ' ')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. TRAJNI PODACI (POMOC, TESKOCE, DOKUMENTI, PRAKSA) */}
                {['POMOC', 'TESKOCE', 'DOKUMENTI', 'PRAKTICNA'].includes(activeSubTab) && (
                  <div className="bg-white border border-gray-200 rounded-md p-6 space-y-5 shadow-sm">
                    {activeSubTab === 'POMOC' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase">PRIMJERENI OBLICI POMOĆI (TRAJNO)</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Podaci o primjerenim oblicima pomoći i podršci kroz godine školovanja</p>
                          </div>
                          {hasFullAccess && (
                            <button
                              onClick={() => handleEditSingleField('support_types', 'Uredi oblike pomoći')}
                              className="px-4 py-2 border border-[#005c8d] text-[#005c8d] bg-[#005c8d]/5 hover:bg-[#005c8d]/10 text-[10px] font-black uppercase tracking-widest rounded transition-all cursor-pointer shadow-sm"
                            >
                              Uredi oblike pomoći
                            </button>
                          )}
                        </div>
                        <div className="bg-slate-50 p-5 rounded border border-gray-200/50 shadow-inner">
                          <p className="text-xs text-slate-800 whitespace-pre-wrap font-semibold leading-relaxed">
                            {profile.support_types || 'Nema unesenog trajnog podatka o primjerenim oblicima pomoći.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {activeSubTab === 'TESKOCE' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase">TEŠKOĆE I PRILAGODBE (TRAJNO)</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Zdravstveni, senzorni, motorički i drugi razvojni podaci</p>
                          </div>
                          {hasFullAccess && (
                            <button
                              onClick={() => handleEditSingleField('disabilities', 'Uredi teškoće')}
                              className="px-4 py-2 border border-[#005c8d] text-[#005c8d] bg-[#005c8d]/5 hover:bg-[#005c8d]/10 text-[10px] font-black uppercase tracking-widest rounded transition-all cursor-pointer shadow-sm"
                            >
                              Uredi teškoće i specifičnosti
                            </button>
                          )}
                        </div>
                        <div className="bg-slate-50 p-5 rounded border border-gray-200/50 shadow-inner">
                          <p className="text-xs text-red-950 whitespace-pre-wrap font-semibold leading-relaxed bg-red-50/10 border border-red-150/10 p-3 rounded">
                            {profile.disabilities || 'Nema unesenog trajnog podatka o specifičnostima.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {activeSubTab === 'DOKUMENTI' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase">SLUŽBENA DOKUMENTACIJA I RJEŠENJA (TRAJNO)</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Klasifikacija službenih rješenja i povijesti dokumentacije</p>
                          </div>
                          {hasFullAccess && (
                            <button
                              onClick={() => handleEditSingleField('documentation', 'Uredi rješenja')}
                              className="px-4 py-2 border border-[#005c8d] text-[#005c8d] bg-[#005c8d]/5 hover:bg-[#005c8d]/10 text-[10px] font-black uppercase tracking-widest rounded transition-all cursor-pointer shadow-sm"
                            >
                              Uredi listu rješenja
                            </button>
                          )}
                        </div>
                        <div className="bg-slate-50 p-5 rounded border border-gray-200/50 shadow-inner">
                          <p className="text-xs text-slate-800 whitespace-pre-wrap font-semibold leading-relaxed">
                            {profile.documentation || 'Nema unesenih trajnih podataka o rješenjima i dokumentaciji.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {activeSubTab === 'PRAKTICNA' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase">STRUČNA PRAKSA / PRAKTIČNA NASTAVA (TRAJNO)</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Specifičnosti obavljanja prakse učenika u privredi</p>
                          </div>
                          {hasFullAccess && (
                            <button
                              onClick={() => handleEditSingleField('practical_training', 'Uredi praksu')}
                              className="px-4 py-2 border border-[#005c8d] text-[#005c8d] bg-[#005c8d]/5 hover:bg-[#005c8d]/10 text-[10px] font-black uppercase tracking-widest rounded transition-all cursor-pointer shadow-sm"
                            >
                              Uredi podatke o praksi
                            </button>
                          )}
                        </div>
                        <div className="bg-slate-50 p-5 rounded border border-gray-200/50 shadow-inner">
                          <p className="text-xs text-slate-800 whitespace-pre-wrap font-semibold leading-relaxed">
                            {profile.practical_training || 'Nema unesenih trajnih podataka o praktičnoj nastavi.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center bg-slate-50">
              <Users size={36} className="text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700 uppercase">Odaberite učenika</h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">U lijevom izborniku odaberite učenika za prikaz pedagoškog kartona.</p>
            </div>
          )}

        </div>
      )}

      {/* UNIFIED MODAL DIALOGS */}
      {showModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-gray-300 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 rounded">
            
            <div className="bg-[#005c8d] p-3 text-white flex items-center justify-between shrink-0">
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} /> 
                {modalType === 'CARD' ? `Osnovni podaci - ${selectedStudent.name}` : 
                 modalType === 'RECOMMENDATIONS' ? `Preporuke za rad - ${selectedStudent.name}` : 
                 modalType === 'ENTRY' ? `Kronološki zapis - ${selectedStudent.name}` : 
                 `Ažuriraj trajni podatak - ${selectedStudent.name}`}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white transition-all cursor-pointer"><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              
              {/* 1. BASIC CARD EDIT */}
              {modalType === 'CARD' && editProfileForm && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1">Program obrazovanja</span>
                      <input 
                        type="text" 
                        value={editProfileForm.education_program}
                        onChange={(e) => setEditProfileForm({ ...editProfileForm, education_program: e.target.value })}
                        className="w-full border border-gray-300 p-2.5 rounded font-black uppercase text-slate-800 focus:outline-[#005c8d]"
                        placeholder="Npr. KUHAR, ELEKTROTEHNIČAR..."
                      />
                    </div>
                    <div>
                      <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1">Primarni razlog dolaska / prijave</span>
                      <input 
                        type="text" 
                        value={editProfileForm.visit_reason}
                        onChange={(e) => setEditProfileForm({ ...editProfileForm, visit_reason: e.target.value })}
                        className="w-full border border-gray-300 p-2.5 rounded font-semibold text-slate-800 focus:outline-[#005c8d]"
                        placeholder="Npr. Poteškoće u ponašanju, rješenje..."
                      />
                    </div>
                  </div>

                  <div>
                    <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1">Prilagodba programa</span>
                    <select
                      value={(editProfileForm as any).programAdjustment || 'NONE'}
                      onChange={(e) => setEditProfileForm({ ...editProfileForm, programAdjustment: e.target.value } as any)}
                      className="w-full border border-gray-300 p-2.5 rounded font-bold text-slate-800 bg-white focus:outline-[#005c8d]"
                    >
                      <option value="NONE">Nema prilagodbe</option>
                      <option value="REGULAR_WITH_ADAPTATION">Redovni program uz prilagodbu</option>
                      <option value="REGULAR_WITH_INDIVIDUALIZATION">Redovni program uz individualizaciju</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1">Teškoće i specifičnosti kod učenja / ponašanja</span>
                    <textarea 
                      rows={2}
                      value={editProfileForm.disabilities}
                      onChange={(e) => setEditProfileForm({ ...editProfileForm, disabilities: e.target.value })}
                      className="w-full border border-gray-300 p-2.5 rounded font-semibold text-red-700 bg-red-50/20 focus:outline-red-500"
                      placeholder="Detaljnije specifičnosti i teškoće..."
                    />
                  </div>
                </div>
              )}

              {/* 2. INLINE STRUCTURAL FIELDS */}
              {['POMOC_EDIT', 'TESKOCE_EDIT', 'DOKUMENTI_EDIT', 'PRAKTICNA_EDIT'].includes(modalType) && (
                <div className="space-y-4">
                  <div>
                    <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1.5">{editSingleTextField.title}</span>
                    <textarea 
                      rows={10}
                      value={editSingleTextField.value}
                      onChange={(e) => setEditSingleTextField({ ...editSingleTextField, value: e.target.value })}
                      className="w-full border border-gray-300 p-3 rounded font-medium text-slate-800 text-xs focus:ring-1 focus:ring-[#005c8d] focus:outline-none leading-relaxed"
                      placeholder="Upišite relevantne podatke i smjernice..."
                    />
                  </div>
                </div>
              )}

              {/* 3. RECOMMENDATIONS EDIT (TEACHER & PARENT) */}
              {modalType === 'RECOMMENDATIONS' && (
                <div className="space-y-4">
                  <div>
                    <span className="block text-[9.5px] font-black uppercase text-emerald-800 tracking-widest flex items-center gap-1 mb-1.5">
                      <Heart size={12} /> Preporuke za rad s učenikom (vidljivo svim nastavnicima)
                    </span>
                    <textarea 
                      rows={5}
                      value={editRecsForm.teacher}
                      onChange={(e) => setEditRecsForm({ ...editRecsForm, teacher: e.target.value })}
                      className="w-full border border-emerald-300 bg-emerald-50/10 p-2.5 rounded font-medium text-slate-800 focus:outline-emerald-500"
                      placeholder="Upute nastavnicima o metodama rada, načinu ispitivanja u razredu..."
                    />
                  </div>

                  <div>
                    <span className="block text-[9.5px] font-black uppercase text-sky-800 tracking-widest flex items-center gap-1 mb-1.5">
                      <Users size={12} /> Preporuke i smjernice za podršku roditelja kod kuće
                    </span>
                    <textarea 
                      rows={4}
                      value={editRecsForm.parent}
                      onChange={(e) => setEditRecsForm({ ...editRecsForm, parent: e.target.value })}
                      className="w-full border border-sky-300 bg-sky-50/10 p-2.5 rounded font-medium text-slate-800 focus:outline-sky-500"
                      placeholder="Preporuke roditeljima kako raditi s djetetom..."
                    />
                  </div>
                </div>
              )}

              {/* 4. CHRONOLOGICAL ENTRY LOG EDIT */}
              {modalType === 'ENTRY' && editLogEntryForm && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1">Vrsta zapisa / Kategorija</span>
                      <select
                        value={editLogEntryForm.recordType}
                        onChange={(e) => setEditLogEntryForm({ ...editLogEntryForm, recordType: e.target.value as any })}
                        className="w-full border border-gray-300 p-2.5 rounded font-bold uppercase text-slate-800 bg-white"
                      >
                        <option value="Mišljenje pedagoga">Mišljenje pedagoga</option>
                        <option value="Mišljenje psihologa">Mišljenje psihologa</option>
                        <option value="Mišljenje defektologa">Mišljenje defektologa</option>
                        <option value="Razgovor s učenikom">Razgovor s učenikom</option>
                        <option value="Razgovor s roditeljima">Razgovor s roditeljima</option>
                        <option value="Opća zabilješka">Opća zabilješka</option>
                      </select>
                    </div>

                    <div>
                      <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1">Datum razgovora / bilješke</span>
                      <input 
                        type="date"
                        value={editLogEntryForm.interviewDate}
                        onChange={(e) => setEditLogEntryForm({ ...editLogEntryForm, interviewDate: e.target.value })}
                        className="w-full border border-gray-300 p-2.5 rounded font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1">Opis problema / Zapažanja</span>
                    <textarea 
                      rows={4}
                      value={editLogEntryForm.problemDescription}
                      onChange={(e) => setEditLogEntryForm({ ...editLogEntryForm, problemDescription: e.target.value })}
                      className="w-full border border-gray-300 p-2.5 rounded font-medium text-slate-800"
                      placeholder="Upišite detaljan opis situacije..."
                    />
                  </div>

                  <div>
                    <span className="block text-[9px] font-black uppercase text-gray-400 tracking-wider mb-1">Poduzete mjere / Zaključci</span>
                    <textarea 
                      rows={3}
                      value={editLogEntryForm.measuresTaken}
                      onChange={(e) => setEditLogEntryForm({ ...editLogEntryForm, measuresTaken: e.target.value })}
                      className="w-full border border-gray-300 p-2.5 rounded font-medium text-slate-800"
                      placeholder="Ishodi razgovora i preporuke..."
                    />
                  </div>

                  <div className="bg-rose-50/20 p-4 border border-rose-100 rounded-md">
                    <span className="block text-[9.5px] font-black uppercase text-rose-700 tracking-widest flex items-center gap-1 mb-1.5 font-bold">
                      <ShieldAlert size={12} /> Povjerljive zabilješke stručnog tima (vidljivo isključivo stručnoj službi i razredniku)
                    </span>
                    <textarea 
                      rows={3}
                      value={editLogEntryForm.confidentialNotes}
                      onChange={(e) => setEditLogEntryForm({ ...editLogEntryForm, confidentialNotes: e.target.value })}
                      className="w-full border border-rose-200 bg-white p-2.5 rounded font-medium text-rose-950 focus:outline-[#005c8d]"
                      placeholder="Zaštićeni stručni podaci, liječnička dijagnostika i sl."
                    />
                  </div>
                </div>
              )}

              {/* FOOTER ACTIONS */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 border border-gray-300 rounded text-[10px] font-bold uppercase tracking-widest text-[#005c8d] hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#005c8d] text-white hover:bg-[#004a71] text-[10px] font-black uppercase tracking-widest rounded transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-md"
                >
                  <Save size={14} /> Spremi podatke
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATIONAL PANEL */}
      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, entry: null, loading: false })}
        onConfirm={confirmDeleteLogEntry}
        title="Brisanje bilješke"
        message="Jeste li sigurni da želite nepovratno obrisati ovu bilješku iz pedagoške dokumentacije za ovu godinu?"
        loading={deleteDialog.loading}
      />

    </div>
  );
}
