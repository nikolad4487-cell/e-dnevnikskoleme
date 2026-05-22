import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { mappers } from '../../lib/mappers';
import { 
  Users, BookOpen, Clock, Heart, ShieldAlert, Edit2, Plus, Trash2, 
  Save, X, FileText, User, Calendar, MessageSquare, AlertCircle, FileSpreadsheet, GraduationCap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';

interface DocRecord {
  id: string;
  studentId: string;
  classId: string;
  schoolYear: string;
  educationProgram?: string;
  assistanceForm?: string;
  difficulties?: string;
  visitReason?: string;
  interviewDate?: string;
  interviewerName?: string;
  recordType?: string;
  problemDescription?: string;
  measuresTaken?: string;
  teacherRecommendationalNotes?: string;
  parentRecommendationalNotes?: string;
  confidentialNotes?: string;
  attachments?: any[];
  status?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export default function PedagoskaDokumentacijaPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, userSchoolRoles } = useAuth();
  const { selectedClassId } = useSelection();
  const navigate = useNavigate();

  const effectiveClassId = classId || selectedClassId;

  // State
  const [loading, setLoading] = useState(true);
  const [activeClass, setActiveClass] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [records, setRecords] = useState<DocRecord[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>(effectiveClassId || '');

  // Edit / Add Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'CARD' | 'ENTRY'>('ENTRY'); 
  const [editingRecord, setEditingRecord] = useState<Partial<DocRecord> | null>(null);

  // Active sub-tab inside the documentary record view
  const [activeSubTab, setActiveSubTab] = useState<string>('INFO');

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    record: DocRecord | null;
    loading: boolean;
  }>({
    isOpen: false,
    record: null,
    loading: false
  });

  // Check Full Counselor/Admin Permissions vs General Teacher
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

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    if (selectedClassFilter) {
      loadClassData(selectedClassFilter);
    }
  }, [selectedClassFilter]);

  const loadClasses = async () => {
    try {
      const { data, error } = await supabase.from('classes').select('*').order('name');
      if (error) throw error;
      setClasses(data || []);
      if (!selectedClassFilter && data && data.length > 0) {
        setSelectedClassFilter(data[0].id);
      }
    } catch (e: any) {
      console.error("Failed to load classes", e);
    }
  };

  const loadClassData = async (cId: string) => {
    setLoading(true);
    try {
      // 1. Fetch Class Details
      const { data: rawClass } = await supabase.from('classes').select('*').eq('id', cId).maybeSingle();
      if (rawClass) setActiveClass(mappers.class(rawClass));

      // 2. Fetch Students
      const { data: enrollData, error: enrollError } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(*)')
        .eq('class_id', cId)
        .eq('status', 'ACTIVE');
      
      if (enrollError) throw enrollError;

      const studentsList = (enrollData || []).map((e: any) => mappers.user(e.student)).filter(Boolean);
      const uniqueStudents = Array.from(new Map(studentsList.map(s => [s.id, s])).values());
      // Sort students alphabetically
      const sortedStudents = uniqueStudents.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(sortedStudents);

      // Select first student by default
      if (sortedStudents.length > 0) {
        setSelectedStudent(sortedStudents[0]);
        loadStudentRecords(sortedStudents[0].id, cId);
      } else {
        setSelectedStudent(null);
        setRecords([]);
      }
    } catch (e: any) {
      console.error("Error loading pedagogical records", e);
      toast.error("Format podataka nije ispravan ili neuspjelo učitavanje.");
    } finally {
      setLoading(false);
    }
  };

  const loadStudentRecords = async (studentId: string, cId: string) => {
    try {
      const response = await fetch(`/api/pedagoska-dokumentacija?studentId=${studentId}&classId=${cId}`);
      if (response.ok) {
        const data = await response.json();
        setRecords(data || []);
      } else {
        throw new Error("API error");
      }
    } catch (e) {
      console.warn("REST fallback triggered or failed. Fetching in-memory fallback.");
      setRecords([]);
    }
  };

  const handleStudentSelect = (student: any) => {
    setSelectedStudent(student);
    loadStudentRecords(student.id, selectedClassFilter);
    setActiveSubTab('INFO');
  };

  // Student level card fields quick edit
  const handleEditStudentCard = () => {
    const defaultData = records.length > 0 ? records[0] : null;
    setEditingRecord({
      studentId: selectedStudent.id,
      classId: selectedClassFilter,
      schoolYear: activeClass?.schoolYear || '2025/2026',
      educationProgram: defaultData?.educationProgram || '',
      assistanceForm: defaultData?.assistanceForm || '',
      difficulties: defaultData?.difficulties || '',
      visitReason: defaultData?.visitReason || '',
      interviewDate: defaultData?.interviewDate || new Date().toISOString().split('T')[0],
      interviewerName: defaultData?.interviewerName || user?.name || '',
      recordType: defaultData?.recordType || 'Pedagog',
      problemDescription: defaultData?.problemDescription || '',
      measuresTaken: defaultData?.measuresTaken || '',
      teacherRecommendationalNotes: defaultData?.teacherRecommendationalNotes || '',
      parentRecommendationalNotes: defaultData?.parentRecommendationalNotes || '',
      confidentialNotes: defaultData?.confidentialNotes || '',
      status: defaultData?.status || 'OPEN',
      attachments: defaultData?.attachments || []
    });
    setModalType('CARD');
    setShowModal(true);
  };

  // Add individual record entry (e.g. counseling summary, talk log)
  const handleAddLogEntry = (type: string) => {
    setEditingRecord({
      studentId: selectedStudent.id,
      classId: selectedClassFilter,
      schoolYear: activeClass?.schoolYear || '2025/2026',
      educationProgram: records[0]?.educationProgram || '',
      assistanceForm: records[0]?.assistanceForm || '',
      difficulties: records[0]?.difficulties || '',
      visitReason: records[0]?.visitReason || '',
      interviewDate: new Date().toISOString().split('T')[0],
      interviewerName: user?.name || '',
      recordType: type,
      problemDescription: '',
      measuresTaken: '',
      teacherRecommendationalNotes: '',
      parentRecommendationalNotes: '',
      confidentialNotes: '',
      status: 'OPEN',
      attachments: []
    });
    setModalType('ENTRY');
    setShowModal(true);
  };

  const handleEditLogEntry = (rec: DocRecord) => {
    setEditingRecord({ ...rec });
    setModalType('ENTRY');
    setShowModal(true);
  };

  const handleDeleteLogEntry = (rec: DocRecord) => {
    console.log("DELETE PEDAGOGICAL RECORD CLICKED", rec);
    setDeleteDialog({
      isOpen: true,
      record: rec,
      loading: false
    });
  };

  const confirmDeleteLogEntry = async () => {
    const record = deleteDialog.record;
    if (!record) return;

    setDeleteDialog(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/pedagoska-dokumentacija/${record.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error("Failed to delete record: " + res.status);
      }
      
      console.log("DELETE PEDAGOGICAL RECORD SUCCESS", record.id);
      toast.success("Bilješka uspješno izbrisana.");
      
      // remove from local state
      setRecords(prev => prev.filter(r => r.id !== record.id));
      
      // refetch records
      if (selectedStudent) {
        loadStudentRecords(selectedStudent.id, selectedClassFilter);
      }
      
      setDeleteDialog({
        isOpen: false,
        record: null,
        loading: false
      });
    } catch (error) {
      console.log("DELETE PEDAGOGICAL RECORD ERROR", error);
      toast.error("Neuspjelo brisanje bilješke.");
      setDeleteDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      const isNew = !editingRecord.id;
      const url = isNew ? `/api/pedagoska-dokumentacija` : `/api/pedagoska-dokumentacija/${editingRecord.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...editingRecord,
          createdBy: user?.id,
          updatedBy: user?.id
        })
      });

      if (res.ok) {
        toast.success(isNew ? "Zapis uspješno dodan." : "Zapis uspješno spremljen.");
        setShowModal(false);
        setEditingRecord(null);
        loadStudentRecords(selectedStudent.id, selectedClassFilter);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || "Problem saving file");
      }
    } catch (err: any) {
      toast.error(err.message || "Neuspjelo spremanje pedagoške dokumentacije.");
    }
  };

  // Get records grouped by active sub-tab
  const filteredLogEntries = records.filter(rec => {
    if (activeSubTab === 'BILJESKE') return rec.recordType?.includes('Mišljenje') || rec.recordType === 'Pedagog' || rec.recordType === 'Psiholog' || rec.recordType === 'Defektolog';
    if (activeSubTab === 'POMOC') return rec.recordType === 'POMOC';
    if (activeSubTab === 'TESKOCE') return rec.recordType === 'TESKOCE';
    if (activeSubTab === 'UCENIK') return rec.recordType === 'UCENIK' || rec.recordType === 'Razgovor s učenikom';
    if (activeSubTab === 'RODITELJI') return rec.recordType === 'RODITELJI' || rec.recordType === 'Razgovor s roditeljima';
    if (activeSubTab === 'DOKUMENTI') return rec.recordType === 'DOKUMENTI' || rec.recordType === 'Rješenje';
    if (activeSubTab === 'PRAKTICNA') return rec.recordType === 'PRAKTICNA' || rec.recordType === 'Praktična nastava';
    return false;
  });

  // Calculate student card data based on existing records
  const getStudentInfoCardData = () => {
    if (records.length === 0) return {
      educationProgram: 'Nije uneseno',
      assistanceForm: 'Nije uneseno',
      difficulties: 'Nije uneseno',
      visitReason: 'Nije uneseno',
      teacherRecommendationalNotes: 'Nema preporuka',
      parentRecommendationalNotes: 'Nema preporuka'
    };
    // Aggregate values
    const primary = records[0];
    return {
      educationProgram: primary.educationProgram || 'Nije uneseno',
      assistanceForm: primary.assistanceForm || 'Nije uneseno',
      difficulties: primary.difficulties || 'Nije uneseno',
      visitReason: primary.visitReason || 'Nije uneseno',
      teacherRecommendationalNotes: primary.teacherRecommendationalNotes || 'Nema preporuka za rad s učenikom.',
      parentRecommendationalNotes: primary.parentRecommendationalNotes || 'Nema preporuka za rad roditelja.'
    };
  };

  const cardData = getStudentInfoCardData();

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
      {/* Top action header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 shadow-sm">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">PEDAGOŠKA DOKUMENTACIJA</h1>
          <p className="text-xs text-slate-500 font-medium">Pregled, preporuke za rad i povjerljive zabilježbe stručne službe škole</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Razred:</span>
          <select 
            value={selectedClassFilter} 
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="text-xs font-bold uppercase border border-gray-300 p-2 rounded shadow-sm bg-white text-slate-800 focus:ring-[#005c8d] cursor-pointer"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-20">
          <div className="w-8 h-8 border-4 border-[#005c8d] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xs text-slate-400 font-bold uppercase">Učitavanje podataka...</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-200 overflow-hidden">
          
          {/* UČENICI LIST (Left Side-bar Panel) */}
          <div className="w-full lg:w-80 bg-white flex flex-col shrink-0 overflow-y-auto">
            <div className="p-4 bg-slate-50/50 border-b border-gray-200 flex items-center gap-2">
              <Users size={16} className="text-slate-500" />
              <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">Popis učenika ({students.length})</span>
            </div>
            
            {students.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-bold italic">Nema učenika u ovom razredu.</div>
            ) : (
              <div className="divide-y divide-gray-100 flex-1">
                {students.map(s => {
                  const isSelected = selectedStudent?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleStudentSelect(s)}
                      className={`w-full text-left p-3.5 flex items-center gap-3 transition-all ${
                        isSelected 
                          ? "bg-sky-50 font-bold text-[#005c8d] border-l-4 border-[#005c8d]" 
                          : "hover:bg-slate-50 border-l-4 border-transparent text-slate-700 hover:text-slate-900"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${
                        isSelected ? "bg-[#005c8d] text-white" : "bg-slate-100 text-slate-600"
                      }`}>
                        {s.name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-none truncate">{s.name}</p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight mt-1">Učenik razreda</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* DOKUMENT PANEL (Right Details Area) */}
          {selectedStudent ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
              
              {/* STUDENT PROFILE CARD */}
              <div className="p-6 bg-white border-b border-gray-200 shrink-0 shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-sky-100/80 rounded-full flex items-center justify-center text-sky-700 border border-sky-200">
                      <User size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{selectedStudent.name}</h2>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded">
                          {activeClass?.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase">
                          Godina: {activeClass?.schoolYear || '2025/2026'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {hasFullAccess && (
                    <button
                      onClick={handleEditStudentCard}
                      className="px-4 py-2 border border-sky-200 text-[#005c8d] bg-sky-50 rounded hover:bg-sky-100 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <Edit2 size={12} /> Uredi osnovne podatke
                    </button>
                  )}
                </div>

                {/* Grid details */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 bg-slate-50 p-4 border border-gray-200 shadow-inner rounded-md text-xs font-semibold">
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Program obrazovanja</p>
                    <p className="text-slate-800 font-bold mt-1 uppercase">{cardData.educationProgram}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Primjereni oblik školovanja</p>
                    <p className="text-slate-800 font-bold mt-1 uppercase">{cardData.assistanceForm}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Teškoće i specifičnosti</p>
                    <p className="text-slate-800 font-bold mt-1 uppercase text-red-700">{cardData.difficulties}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Razlog prijavljivanja / dolaska</p>
                    <p className="text-slate-800 mt-1 italic">{cardData.visitReason}</p>
                  </div>
                </div>
              </div>

              {/* TABS OF PEDAGOGICAL SECTION */}
              <div className="bg-white border-b border-gray-200 px-6 flex items-center overflow-x-auto no-scrollbar shrink-0">
                <button
                  onClick={() => setActiveSubTab('INFO')}
                  className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                    activeSubTab === 'INFO' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                  }`}
                >
                  <span className="flex items-center gap-1.5"><Heart size={12} /> Preporuke za rad</span>
                </button>

                {hasFullAccess && (
                  <>
                    <button
                      onClick={() => setActiveSubTab('BILJESKE')}
                      className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'BILJESKE' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><FileText size={12} /> Bilješke stručne službe</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('POMOC')}
                      className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'POMOC' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><BookOpen size={12} /> Primjereni oblici pomoći</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('TESKOCE')}
                      className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'TESKOCE' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><AlertCircle size={12} /> Teškoće i prilagodbe</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('UCENIK')}
                      className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'UCENIK' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><User size={12} /> Razgovori s učenikom</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('RODITELJI')}
                      className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'RODITELJI' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><MessageSquare size={12} /> Razgovori s roditeljima</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('DOKUMENTI')}
                      className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'DOKUMENTI' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><FileSpreadsheet size={12} /> Dokumentacija</span>
                    </button>
                    <button
                      onClick={() => setActiveSubTab('PRAKTICNA')}
                      className={`px-5 py-3.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-4 whitespace-nowrap ${
                        activeSubTab === 'PRAKTICNA' ? "text-[#005c8d] border-[#005c8d] font-black" : "text-gray-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><GraduationCap size={12} /> Praktična nastava</span>
                    </button>
                  </>
                )}
              </div>

              {/* TAB CONTAINER */}
              <div className="flex-1 overflow-y-auto p-6">
                
                {/* 1. INFO TAB - VISIBLE TO EVERYONE (TEACHERS AND STAFF) */}
                {activeSubTab === 'INFO' && (
                  <div className="space-y-6">
                    <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-md shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <Heart className="text-emerald-600" size={18} />
                        <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-tight">OSNOVNE PREPORUKE ZA RAD S UČENIKOM U RAZREDU</h3>
                      </div>
                      <p className="text-xs text-emerald-900 leading-relaxed font-semibold bg-white p-4 border border-emerald-100 rounded shadow-inner whitespace-pre-wrap">
                        {cardData.teacherRecommendationalNotes}
                      </p>
                    </div>

                    <div className="bg-sky-50 border border-sky-200 p-5 rounded-md shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="text-sky-600" size={18} />
                        <h3 className="text-sm font-bold text-sky-800 uppercase tracking-tight">PREPORUKE ZA RODITELJE I PODRŠKU KOD KUĆE</h3>
                      </div>
                      <p className="text-xs text-sky-900 leading-relaxed font-semibold bg-white p-4 border border-sky-100 rounded shadow-inner whitespace-pre-wrap">
                        {cardData.parentRecommendationalNotes}
                      </p>
                    </div>

                    {!hasFullAccess && (
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded text-xs text-amber-800 font-medium flex items-center gap-2">
                        <ShieldAlert size={16} className="shrink-0" />
                        <span>Kao nastavnik, imate ovlasti vidjeti isključivo osnovne preporuke. Cjelovita pedagoška dijagnostika i povjerljive zabilješke stručnog tima su zaštićene.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. LOGGED TABS - ACCESSIBLE ONLY BY STRUČNA SLUŽBA/HOMEROOM/ADMIN */}
                {activeSubTab !== 'INFO' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-3 border border-gray-200 rounded shadow-sm">
                      <span className="text-xs font-bold text-gray-500 uppercase">
                        Evidencija zapisa ({filteredLogEntries.length})
                      </span>
                      <button
                        onClick={() => handleAddLogEntry(
                          activeSubTab === 'BILJESKE' ? 'Mišljenje pedagoga' : activeSubTab
                        )}
                        className="bg-[#005c8d] text-white px-3.5 py-2 hover:bg-[#004a71] text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 transition-all shadow cursor-pointer active:scale-95"
                      >
                        <Plus size={12} /> Dodaj zapis
                      </button>
                    </div>

                    {filteredLogEntries.length === 0 ? (
                      <div className="bg-white border border-gray-200 rounded-md p-10 text-center">
                        <p className="text-xs text-gray-400 font-bold italic">Nema unesenih zapisa za odabrano poglavlje.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredLogEntries.map(rec => (
                          <div key={rec.id} className="bg-white border border-gray-200 rounded-md p-5 shadow-sm relative group hover:border-[#005c8d] transition-all">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3 mb-3 shrink-0">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[#005c8d]/10 text-[#005c8d] border border-[#005c8d]/20">
                                  {rec.recordType}
                                </span>
                                <span className="text-[10px] text-gray-400 font-extrabold uppercase flex items-center gap-1">
                                  <Calendar size={10} /> {rec.interviewDate || rec.createdAt?.slice(0, 10)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditLogEntry(rec)}
                                  className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-slate-50 border border-transparent rounded transition-colors"
                                  title="Uredi"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteLogEntry(rec)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-50 border border-transparent rounded transition-colors"
                                  title="Obriši"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-slate-50/55 p-3.5 border border-gray-200/60 rounded">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Opis problema / Situacija</h4>
                                <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">{rec.problemDescription || '--'}</p>
                              </div>

                              <div className="bg-slate-50/55 p-3.5 border border-gray-200/60 rounded">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Poduzete mjere / Zaključak</h4>
                                <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">{rec.measuresTaken || '--'}</p>
                              </div>
                            </div>

                            {rec.confidentialNotes && (
                              <div className="mt-4 p-4 border border-rose-100 bg-rose-50/20 rounded-md">
                                <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-widest flex items-center gap-1 mb-1.5">
                                  <ShieldAlert size={12} /> Povjerljive zabilješke stručnog tima
                                </h4>
                                <p className="text-xs text-rose-950 whitespace-pre-wrap leading-relaxed italic">{rec.confidentialNotes}</p>
                              </div>
                            )}

                            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[9px] text-gray-400 font-bold uppercase tracking-tight">
                              <span>Sastavio/la: {rec.interviewerName ||'Stručna služba'}</span>
                              <span>Zadnja promjena: {rec.updatedAt?.slice(0, 16).replace('T', ' ')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center bg-slate-50">
              <Users size={48} className="text-slate-300 mb-4 animate-bounce" />
              <h3 className="text-sm font-bold text-slate-700 uppercase">Odaberite učenika</h3>
              <p className="text-xs text-slate-400 mt-1">U lijevom izborniku odaberite učenika za prikaz pedagoškog kartona.</p>
            </div>
          )}

        </div>
      )}

      {/* MODAL ZA UNOS / UREĐIVANJE */}
      {showModal && editingRecord && (
        <div className="fixed inset-0 bg-black/45 z-55 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-gray-300 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
            
            <div className="bg-[#005c8d] p-3 text-white flex items-center justify-between shrink-0">
              <h3 className="text-xs font-extrabold uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} /> 
                {modalType === 'CARD' ? `Osnovni podaci - ${selectedStudent.name}` : `Zabilješka - ${selectedStudent.name}`}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white transition-all"><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              
              {modalType === 'CARD' ? (
                /* CARD EDIT CHUNKS */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Program obrazovanja</label>
                      <input 
                        type="text" 
                        value={editingRecord.educationProgram || ''}
                        onChange={(e) => setEditingRecord({...editingRecord, educationProgram: e.target.value})}
                        className="w-full border border-gray-300 p-2.5 rounded font-bold uppercase text-slate-800"
                        placeholder="Npr. KUHAR, INSTALATER, OPĆA GIMNAZIJA..."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Primjereni oblik školovanja / pomoći</label>
                      <input 
                        type="text" 
                        value={editingRecord.assistanceForm || ''}
                        onChange={(e) => setEditingRecord({...editingRecord, assistanceForm: e.target.value})}
                        className="w-full border border-gray-300 p-2.5 rounded font-bold uppercase text-slate-800"
                        placeholder="Npr. INDIVIDUALIZIRANI PRISTUP, PRILAGOĐENI PROGRAM..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Teškoće i specifičnosti kod učenja / ponašanja</label>
                    <input 
                      type="text" 
                      value={editingRecord.difficulties || ''}
                      onChange={(e) => setEditingRecord({...editingRecord, difficulties: e.target.value})}
                      className="w-full border border-gray-300 p-2.5 rounded font-extrabold uppercase text-red-600 bg-red-50/20"
                      placeholder="Npr. DISLALUJA, ADHD, OŠTEĆENJE VIDA..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Primarni razlog dolaska / prijave</label>
                    <textarea 
                      rows={2}
                      value={editingRecord.visitReason || ''}
                      onChange={(e) => setEditingRecord({...editingRecord, visitReason: e.target.value})}
                      className="w-full border border-gray-300 p-2.5 rounded font-medium text-slate-800"
                      placeholder="Razlog upućivanja stručnoj službi..."
                    />
                  </div>

                  <div className="border-t border-gray-200 pt-4 space-y-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-emerald-800 tracking-widest flex items-center gap-1 mb-1">
                        <Heart size={12} /> Preporuke za rad s učenikom (vidi svi nastavnici)
                      </label>
                      <textarea 
                        rows={4}
                        value={editingRecord.teacherRecommendationalNotes || ''}
                        onChange={(e) => setEditingRecord({...editingRecord, teacherRecommendationalNotes: e.target.value})}
                        className="w-full border border-emerald-300 bg-emerald-50/10 p-2.5 rounded font-medium text-slate-800 focus:outline-emerald-500"
                        placeholder="Upute nastavnicima o metodama rada, sjedenju, načinu ispitivanja..."
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-sky-800 tracking-widest flex items-center gap-1 mb-1">
                        <Users size={12} /> Preporuke i podrška za roditelje
                      </label>
                      <textarea 
                        rows={3}
                        value={editingRecord.parentRecommendationalNotes || ''}
                        onChange={(e) => setEditingRecord({...editingRecord, parentRecommendationalNotes: e.target.value})}
                        className="w-full border border-sky-300 bg-sky-50/10 p-2.5 rounded font-medium text-slate-800 focus:outline-sky-500"
                        placeholder="Preporuke roditeljima kako raditi s djetetom kod kuće..."
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* ENTRY LOG EDIT CHUNKS */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Vrsta zapisa / Kategorija</label>
                      <select
                        value={editingRecord.recordType || ''}
                        onChange={(e) => setEditingRecord({...editingRecord, recordType: e.target.value})}
                        className="w-full border border-gray-300 p-2.5 rounded font-bold uppercase text-slate-800 bg-white"
                      >
                        <option value="Mišljenje pedagoga">Mišljenje pedagoga</option>
                        <option value="Mišljenje psihologa">Mišljenje psihologa</option>
                        <option value="Mišljenje defektologa">Mišljenje defektologa</option>
                        <option value="Razgovor s učenikom">Razgovor s učenikom</option>
                        <option value="Razgovor s roditeljima">Razgovor s roditeljima</option>
                        <option value="POMOC">Primjereni oblici pomoći</option>
                        <option value="TESKOCE">Teškoće i prilagodbe</option>
                        <option value="DOKUMENTI">Dokumentacija i rješenja</option>
                        <option value="PRAKTICNA">Praktična nastava</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Datum razgovora / bilješke</label>
                      <input 
                        type="date"
                        value={editingRecord.interviewDate || ''}
                        onChange={(e) => setEditingRecord({...editingRecord, interviewDate: e.target.value})}
                        className="w-full border border-gray-300 p-2.5 rounded font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Osoba koja je vodila razgovor</label>
                      <input 
                        type="text"
                        value={editingRecord.interviewerName || ''}
                        onChange={(e) => setEditingRecord({...editingRecord, interviewerName: e.target.value})}
                        className="w-full border border-gray-300 p-2.5 rounded font-bold text-slate-800 bg-gray-50/50"
                        placeholder="Ime i prezime stručnog suradnika"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Opis problema / Zapažanja / Detalji</label>
                    <textarea 
                      rows={4}
                      value={editingRecord.problemDescription || ''}
                      onChange={(e) => setEditingRecord({...editingRecord, problemDescription: e.target.value})}
                      className="w-full border border-gray-300 p-2.5 rounded font-medium text-slate-800"
                      placeholder="Upišite detaljan opis situacije..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Poduzete mjere / Zaključci / Sljedeći koraci</label>
                    <textarea 
                      rows={3}
                      value={editingRecord.measuresTaken || ''}
                      onChange={(e) => setEditingRecord({...editingRecord, measuresTaken: e.target.value})}
                      className="w-full border border-gray-300 p-2.5 rounded font-medium text-slate-800"
                      placeholder="Zaključci, savjetovanje, ishod razgovora..."
                    />
                  </div>

                  <div className="bg-rose-50/20 p-4 border border-rose-100 rounded-md">
                    <label className="block text-[10px] font-black uppercase text-rose-700 tracking-widest flex items-center gap-1 mb-1">
                      <ShieldAlert size={12} /> Povjerljive zabilješke stručne službe (vidi samo stručna služba/ravnatelj/razrednik)
                    </label>
                    <textarea 
                      rows={3}
                      value={editingRecord.confidentialNotes || ''}
                      onChange={(e) => setEditingRecord({...editingRecord, confidentialNotes: e.target.value})}
                      className="w-full border border-rose-200 p-2.5 rounded font-medium text-slate-800 bg-white"
                      placeholder="Zaštićeni podaci o djetetu, liječničkoj dijagnostici i sl."
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 border border-gray-300 rounded text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-gray-100 transition-all cursor-pointer"
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

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, record: null, loading: false })}
        onConfirm={confirmDeleteLogEntry}
        title="Brisanje bilješke"
        message="Jeste li sigurni da želite obrisati ovu bilješku pedagoške dokumentacije?"
        loading={deleteDialog.loading}
      />

    </div>
  );
}
