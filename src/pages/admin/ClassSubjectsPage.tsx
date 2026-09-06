import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Subject, User, Role } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Plus, 
  Trash2, 
  Pencil,
  ChevronLeft, 
  BookOpen, 
  GraduationCap, 
  User as UserIcon,
  Search,
  RefreshCw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { formatSubjectDisplayName, sanitizeSubjectType, getForcedSubjectType, formatSubjectName } from '../../lib/utils';
import { ensureDefaultGradingElementsForAssignment } from '../../lib/gradingElementTemplates';

export default function ClassSubjectsPage() {
  const { selectedSchoolId, selectedClassId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ classId?: string }>();
  const [searchParams] = useSearchParams();
  const classId = params.classId || searchParams.get('classId') || selectedClassId;

  console.log("ADMIN RAZREDA selectedClass", selectedClassId);
  console.log("ADMIN RAZREDA params", params);
  console.log("ADMIN RAZREDA resolved classId", classId);
  
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => r.schoolId === selectedSchoolId && (r.role === Role.SCHOOL_ADMIN || r.role === Role.ADMIN));
  
  // Assign State
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');

  // Delete State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    subjectId: string;
    subjectName: string;
  }>({
    isOpen: false,
    subjectId: '',
    subjectName: '',
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Edit State
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    assignmentId: string;
    subjectId: string;
    subjectName: string;
    subjectType: string;
    subjectPeriod: string;
    teacherId: string;
    groupName: string;
  }>({
    isOpen: false,
    assignmentId: '',
    subjectId: '',
    subjectName: '',
    subjectType: 'REDOVNI',
    subjectPeriod: 'FULL_YEAR',
    teacherId: '',
    groupName: '',
  });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (!selectedSchoolId) {
      navigate('/select-school');
      return;
    }
    if (!classId) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [selectedSchoolId, classId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch Class Info
      const { data: cls, error: clsError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();
        
      console.log("ADMIN RAZREDA class fetch result", cls, clsError);
      
      if (clsError) throw clsError;
      setCurrentClass(cls);

      // Fetch Assignments
      const { data: assignData, error: assignError } = await supabase
        .from('class_subject_teachers')
        .select(`
          id,
          class_id,
          subject_id,
          teacher_id,
          school_id,
          group_name,
          subject:subjects (*),
          teacher:user_profiles (*)
        `)
        .eq('class_id', classId);
      if (assignError) throw assignError;

      // Fetch Class Subjects metadata
      const { data: csData, error: csError } = await supabase
        .from('class_subjects')
        .select('*')
        .eq('class_id', classId);
      if (csError) throw csError;

      const mergedAssignments = (assignData || []).map(item => {
        const cs = (csData || []).find((c: any) => c.subject_id === item.subject_id);
        return {
          ...item,
          class_subject: cs || {
            subject_type: 'REDOVNI',
            subject_period: 'FULL_YEAR'
          }
        };
      });
      setAssignments(mergedAssignments);

      // Fetch All Global Subjects
      const { data: subData, error: subError } = await supabase.from('subjects').select('*').order('name');
      if (subError) throw subError;
      setAllSubjects(subData || []);

      // Fetch Teachers in school
      const { data: teachData, error: teachError } = await supabase
        .from('user_school_roles')
        .select(`
          user:user_profiles (*)
        `)
        .eq('school_id', selectedSchoolId)
        .in('role', [Role.TEACHER, Role.HOMEROOM, Role.SCHOOL_ADMIN]);
      if (teachError) throw teachError;
      
      const rawUserList = (teachData || []).map(t => t.user).filter(Boolean);
      const uniqueTeachers = rawUserList.filter((item: any, index: number, self: any[]) => 
        self.findIndex((t: any) => t.id === item.id) === index
      );
      setTeachers(uniqueTeachers as any[]);

    } catch (err: any) {
      toast.error('Greška pri učitavanju');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
        setLoading(true);
        const res = await fetch('/api/admin/sync-class-subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classId })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        toast.success(`Sinkronizacija uspješna: dodano ${data.results.added}, obrisano ${data.results.deleted}`);
        fetchData(); // Reload assignments
    } catch(err: any) {
        toast.error('Sync failed: ' + err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleAssignSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAnyAdmin) {
      console.warn("Attempted subject assign without admin permissions");
      return;
    }
    if (!selectedSubjectId || !selectedTeacherId) {
      toast.error('Odaberite predmet i nastavnika');
      return;
    }

    console.log("ASSIGN SUBJECT TO CLASS CLICKED", { classId, selectedSubjectId, selectedTeacherId });

    try {
      const { data: existingCS } = await supabase
        .from('class_subjects')
        .select('id, subject_type')
        .eq('class_id', classId)
        .eq('subject_id', selectedSubjectId)
        .maybeSingle();

      console.log("ADDING TEACHER TO CLASS SUBJECT", {
        classSubjectId: existingCS?.id,
        subjectId: selectedSubjectId,
        oldSubjectType: existingCS?.subject_type,
        newTeacherId: selectedTeacherId
      });

      const subjectName = allSubjects.find(s => s.id === selectedSubjectId)?.name || '';
      const finalSubjectType = getForcedSubjectType(subjectName, existingCS?.subject_type || 'REDOVNI');

      // 1. Ensure class_subjects entry exists, preserve existing subject_type if present
      const { error: csError } = await supabase.from('class_subjects').upsert([{
        class_id: classId,
        subject_id: selectedSubjectId,
        school_id: selectedSchoolId,
        subject_type: finalSubjectType,
        is_foreign_language: false,
        subject_period: 'FULL_YEAR'
      }], { onConflict: 'class_id,subject_id' });
      if (csError) throw csError;

      // 2. Insert class_subject_teachers
      const { data, error } = await supabase.from('class_subject_teachers').insert([{
        class_id: classId,
        subject_id: selectedSubjectId,
        teacher_id: selectedTeacherId,
        school_id: selectedSchoolId,
        subject_type: finalSubjectType
      }]).select();

      console.log("ASSIGN SUBJECT RESULT:", { data, error });

      if (error) {
        if (error.code === '23505') throw new Error('Ovaj predmet je već dodijeljen ovom razredu.');
        throw error;
      }

      await ensureDefaultGradingElementsForAssignment(supabase, {
        schoolId: selectedSchoolId,
        classId,
        subjectId: selectedSubjectId,
        teacherId: selectedTeacherId,
        subjectName
      });

      toast.success('Predmet dodijeljen razredu');
      setSelectedSubjectId('');
      setSelectedTeacherId('');
      fetchData();
    } catch (err: any) {
      console.error("ASSIGN SUBJECT FAILED:", err);
      toast.error(err.message || 'Greška pri dodjeli predmeta');
    }
  };

  const handleEditAssignmentClick = (item: any) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za uređivanje predmeta.');
      return;
    }
    const sId = item.subject?.id || '';
    console.log("EDIT CLASS SUBJECT", { classId, subjectId: sId });
    setEditModal({
      isOpen: true,
      assignmentId: item.id,
      subjectId: sId,
      subjectName: item.subject?.name || '',
      subjectType: item.class_subject?.subject_type || 'redovni',
      subjectPeriod: item.class_subject?.subject_period || 'FULL_YEAR',
      teacherId: item.teacher?.id || '',
      groupName: item.group_name || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { assignmentId, subjectId, subjectType, subjectPeriod, teacherId, groupName } = editModal;
    if (!classId || !subjectId || !assignmentId) return;

    console.log("EDIT CLASS SUBJECT", { classId, subjectId });

    try {
      setEditLoading(true);

      const sName = editModal.subjectName || '';
      const finalSubjectType = getForcedSubjectType(sName, sanitizeSubjectType(subjectType));

      // A. Update class_subjects metadata
      const { error: csError } = await supabase
        .from('class_subjects')
        .upsert([{
          class_id: classId,
          subject_id: subjectId,
          school_id: selectedSchoolId,
          subject_type: finalSubjectType,
          subject_period: subjectPeriod
        }], { onConflict: 'class_id,subject_id' });

      if (csError) {
        console.log("EDIT CLASS SUBJECT ERROR", csError);
        throw csError;
      }

      // B. Update class_subject_teachers assignment
      const { error: astError } = await supabase
        .from('class_subject_teachers')
        .update({
          teacher_id: teacherId,
          group_name: groupName || null,
          subject_type: finalSubjectType
        })
        .eq('id', assignmentId);

      if (astError) {
        console.log("EDIT CLASS SUBJECT ERROR", astError);
        throw astError;
      }

      toast.success('Predmet zaduženja uspješno uređen');
      setEditModal(prev => ({ ...prev, isOpen: false }));
      fetchData();
    } catch (err: any) {
      console.log("EDIT CLASS SUBJECT ERROR", err);
      toast.error('Greška pri spremanju: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleRemoveAssignmentClick = (subjectId: string, subjectName: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za uklanjanje predmeta.');
      return;
    }
    setDeleteModal({
      isOpen: true,
      subjectId,
      subjectName
    });
  };

  const handleConfirmDelete = async () => {
    const { subjectId } = deleteModal;
    if (!classId || !subjectId) return;

    console.log("REMOVE CLASS SUBJECT", { classId, subjectId });

    try {
      setDeleteLoading(true);

      // 1. obrisati veze iz class_subject_teachers za taj class_id + subject_id
      const { error: assocError } = await supabase
        .from('class_subject_teachers')
        .delete()
        .eq('class_id', classId)
        .eq('subject_id', subjectId);

      if (assocError) {
        console.log("REMOVE CLASS SUBJECT ERROR", assocError);
        throw assocError;
      }

      // 2. obrisati upise učenika iz student_subject_enrollments za taj class_id + subject_id
      const { error: enrollError } = await supabase
        .from('student_subject_enrollments')
        .delete()
        .eq('class_id', classId)
        .eq('subject_id', subjectId);

      if (enrollError) {
        console.log("REMOVE CLASS SUBJECT ERROR", enrollError);
        throw enrollError;
      }

      // 3. po potrebi obrisati/odspojiti chat kanal predmeta iz chat_groups gdje type = SUBJECT_CHANNEL
      const { error: chatError } = await supabase
        .from('chat_groups')
        .delete()
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .eq('type', 'SUBJECT_CHANNEL');

      if (chatError) {
        console.warn("Error deleting subject chat group:", chatError);
      }

      // 4. obrisati iz class_subjects za taj class_id + subject_id
      const { error: csDelError } = await supabase
        .from('class_subjects')
        .delete()
        .eq('class_id', classId)
        .eq('subject_id', subjectId);

      if (csDelError) {
        console.log("REMOVE CLASS SUBJECT ERROR", csDelError);
        throw csDelError;
      }

      toast.success('Predmet uklonjen iz razreda');
      setDeleteModal({ isOpen: false, subjectId: '', subjectName: '' });
      fetchData();
    } catch (err: any) {
      console.log("REMOVE CLASS SUBJECT ERROR", err);
      toast.error('Greška pri uklanjanju: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="p-10 font-black uppercase text-slate-300 animate-pulse text-center">Učitavanje...</div>;

  if (!classId) {
    return (
      <div className="p-10 text-center font-sans">
        <h2 className="text-lg font-bold text-gray-700">Odaberite razred</h2>
        <p className="text-sm text-gray-500 mt-2">Nije odabran nijedan razredni odjel.</p>
        <button 
          onClick={() => navigate('/select-class')}
          className="mt-4 bg-[#005c8d] text-white px-4 py-2 font-bold text-xs uppercase"
        >
          Odaberi razred
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 font-sans w-full">
      <div className="flex justify-between items-end mb-8 border-b-2 border-slate-100 pb-6">
        <div>
          <button 
            onClick={() => navigate('/admin/razredi')}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors uppercase font-black text-[9px] tracking-widest mb-4"
          >
            <ChevronLeft size={12} strokeWidth={3} />
            Natrag na razrede
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black">
              {currentClass?.name}
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Predmeti razreda</h1>
            <button 
              onClick={handleSync}
              className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 font-black text-xs uppercase hover:bg-amber-600 transition-colors rounded-xl"
            >
              <RefreshCw size={14} /> Sinkroniziraj
            </button>
          </div>
          <p className="text-slate-500 font-medium text-sm">Dodjela nastavnih predmeta i njihovih izvođača razrednom odjelu</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Assignment Form */}
        {isAnyAdmin && (
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 p-6 border-b border-slate-100">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Dodijeli novi predmet</h2>
              </div>
              <form onSubmit={handleAssignSubject} className="p-6 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Predmet</label>
                  <select 
                    value={selectedSubjectId}
                    onChange={e => setSelectedSubjectId(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                    required
                  >
                    <option value="">Odaberi predmet...</option>
                    {allSubjects.map(s => (
                      <option key={s.id} value={s.id}>{formatSubjectName(s)} ({s.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Nastavnik izvođač</label>
                  <select 
                    value={selectedTeacherId}
                    onChange={e => setSelectedTeacherId(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                    required
                  >
                    <option value="">Odaberi nastavnika...</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{(t as any).name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-[#005c8d] text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-[#004a71] transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={16} strokeWidth={3} />
                  Dodijeli predmet
                </button>
              </form>
            </div>
          </div>
        )}

        {/* List of Subjects */}
        <div className={isAnyAdmin ? "lg:col-span-2" : "lg:col-span-3"}>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <th className="p-4">Predmet</th>
                  <th className="p-4">Nastavnik</th>
                  <th className="p-4 text-right">Radnje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {assignments.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                          <BookOpen size={18} />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 uppercase text-xs tracking-tight">
                            {formatSubjectDisplayName(item.subject?.name || '', item.class_subject?.subject_type || 'REDOVNI')}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">{item.subject?.code}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-blue-50 text-blue-700 tracking-tighter">
                              {item.class_subject?.subject_type || 'REDOVNI'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-100 text-slate-600 tracking-tighter">
                              {item.class_subject?.subject_period === 'FIRST_SEMESTER' 
                                ? '1. polugodište' 
                                : item.class_subject?.subject_period === 'SECOND_SEMESTER' 
                                  ? '2. polugodište' 
                                  : 'Cijela godina'}
                            </span>
                            {item.group_name && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-50 text-amber-700 tracking-tighter">
                                Grupa: {item.group_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                          <UserIcon size={14} />
                        </div>
                        <span className="font-bold text-slate-700 text-sm">{item.teacher?.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {isAnyAdmin && (
                        <div className="flex justify-end items-center gap-2">
                          <button 
                            onClick={() => handleEditAssignmentClick(item)}
                            className="px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200 font-bold uppercase tracking-tight flex items-center gap-1.5 transition-colors cursor-pointer rounded-lg"
                            title="Uredi predmet"
                          >
                            <Pencil size={14} />
                            <span>Uredi</span>
                          </button>
                          <button 
                            onClick={() => handleRemoveAssignmentClick(item.subject?.id, item.subject?.name || '')}
                            className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 font-bold uppercase tracking-tight flex items-center gap-1.5 transition-colors cursor-pointer rounded-lg"
                            title="Ukloni predmet u razredu"
                          >
                            <Trash2 size={14} />
                            <span>Ukloni</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.2em]">
                      Nema dodijeljenih predmeta za ovaj razred
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, subjectId: '', subjectName: '' })}
        onConfirm={handleConfirmDelete}
        title="Ukloni predmet"
        message="Jeste li sigurni da želite ukloniti predmet iz ovog razreda?"
        loading={deleteLoading}
      />

      {editModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="bg-[#005c8d] text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest">Uredi predmet u razredu</h3>
              <button 
                onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
                className="text-white/80 hover:text-white text-xs font-bold uppercase"
              >
                Zatvori
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Predmet</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-500 uppercase text-xs">
                  {editModal.subjectName}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pregled prikaza naziva u razredu</label>
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 font-black text-[#005c8d] text-sm uppercase">
                  {formatSubjectDisplayName(editModal.subjectName, editModal.subjectType)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status (Vrsta)</label>
                  <select
                    value={editModal.subjectType}
                    onChange={e => setEditModal({ ...editModal, subjectType: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none text-xs"
                    required
                  >
                    <option value="REDOVNI">Redovni</option>
                    <option value="IZBORNI">Izborni</option>
                    <option value="FAKULTATIVNI">Fakultativni</option>
                    <option value="PRAKSA">Praksa</option>
                    <option value="DOPUNSKA NASTAVA">Dopunska nastava</option>
                    <option value="DODATNA NASTAVA">Dodatna nastava</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Trajanje</label>
                  <select
                    value={editModal.subjectPeriod}
                    onChange={e => setEditModal({ ...editModal, subjectPeriod: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none text-xs"
                    required
                  >
                    <option value="FULL_YEAR">Cijela godina</option>
                    <option value="FIRST_SEMESTER">1. polugodište</option>
                    <option value="SECOND_SEMESTER">2. polugodište</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Zaduženi nastavnik</label>
                <select
                  value={editModal.teacherId}
                  onChange={e => setEditModal({ ...editModal, teacherId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none text-xs"
                  required
                >
                  <option value="">Odaberi nastavnika...</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{(t as any).name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Grupa (neobavezno)</label>
                <input
                  type="text"
                  value={editModal.groupName}
                  onChange={e => setEditModal({ ...editModal, groupName: e.target.value })}
                  placeholder="Npr. Grupa A"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-3 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-700 font-bold uppercase text-[9px] tracking-widest transition-colors"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-6 py-3 bg-[#005c8d] hover:bg-[#004a71] text-white rounded-xl font-bold uppercase text-[9px] tracking-widest transition-all min-w-[100px]"
                >
                  {editLoading ? 'Spremanje...' : 'Spremi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
