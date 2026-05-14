import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Subject, Role } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { 
  ChevronLeft, 
  Search, 
  BookOpen, 
  CheckCircle2, 
  XCircle,
  Users,
  Filter,
  Check,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function StudentSubjectEnrollmentPage() {
  const { selectedSchoolId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => r.schoolId === selectedSchoolId && (r.role === Role.SCHOOL_ADMIN || r.role === Role.ADMIN));

  useEffect(() => {
    if (!selectedSchoolId) {
      navigate('/admin/schools');
      return;
    }
    fetchClasses();
  }, [selectedSchoolId]);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassData();
    } else {
      setStudents([]);
      setSubjects([]);
      setEnrollments([]);
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').eq('school_id', selectedSchoolId).order('name');
    setClasses(data || []);
    if (data && data.length > 0) {
      // Don't auto-select to avoid heavy fetch
    }
  };

  const fetchClassData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Class Subjects
      const { data: classSubjects } = await supabase
        .from('class_subject_teachers')
        .select('subject:subjects(*)')
        .eq('class_id', selectedClassId);
      
      const mappedSubjects = (classSubjects || []).map(cs => cs.subject).filter(Boolean) as any[] as Subject[];
      setSubjects(mappedSubjects);

      // 2. Fetch Students in Class
      const { data: enrolls } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(*)')
        .eq('class_id', selectedClassId)
        .eq('status', 'ACTIVE');
      
      const mappedStudents = (enrolls || []).map(e => e.student).filter(Boolean);
      setStudents(mappedStudents);

      // 3. Fetch Subject Enrollments
      const { data: subEnrolls } = await supabase
        .from('student_subject_enrollments')
        .select('*')
        .eq('class_id', selectedClassId);
      
      setEnrollments(subEnrolls || []);

    } catch (err: any) {
      toast.error('Greška pri učitavanju');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnrollment = async (studentId: string, subjectId: string, currentStatus?: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za mijenjanje upisa.');
      return;
    }
    
    const newStatus = (currentStatus === 'ACTIVE') ? 'EXEMPT' : 'ACTIVE';
    console.log("TOGGLE STUDENT SUBJECT ENROLLMENT CLICKED", { studentId, subjectId, newStatus });

    try {
      const { data, error } = await supabase
        .from('student_subject_enrollments')
        .upsert({
          student_id: studentId,
          subject_id: subjectId,
          class_id: selectedClassId,
          status: newStatus,
          school_year: '2024/2025' // Should be dynamic
        }, { onConflict: 'student_id,subject_id,class_id,school_year' })
        .select();
      
      console.log("TOGGLE ENROLLMENT RESULT:", { data, error });

      if (error) throw error;
      
      toast.success(newStatus === 'ACTIVE' ? 'Sluša predmet' : 'Oslobođen predmeta');
      
      // Local update for speed
      setEnrollments(prev => {
        const other = prev.filter(e => !(e.student_id === studentId && e.subject_id === subjectId));
        return [...other, { student_id: studentId, subject_id: subjectId, status: newStatus }];
      });
    } catch (err: any) {
      console.error("TOGGLE ENROLLMENT FAILED:", err);
      toast.error('Greška pri izmjeni upisa: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const assignAllToSubject = async (subjectId: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za masovni upis.');
      return;
    }
    
    console.log("ASSIGN ALL TO SUBJECT CLICKED", { subjectId, selectedClassId });

    if (!window.confirm('Dodijeli ovaj predmet svim učenicima u razredu?')) return;
    try {
      const payload = students.map(s => ({
        student_id: s.id,
        subject_id: subjectId,
        class_id: selectedClassId,
        status: 'ACTIVE',
        school_year: '2024/2025'
      }));
      
      const { data, error } = await supabase.from('student_subject_enrollments').upsert(payload, { onConflict: 'student_id,subject_id,class_id,school_year' }).select();
      console.log("ASSIGN ALL RESULT:", { data, error });
      
      if (error) throw error;
      
      toast.success('Predmet dodijeljen svima');
      fetchClassData();
    } catch (err: any) {
      console.error("ASSIGN ALL FAILED:", err);
      toast.error('Masovni upis nije uspio: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a,b) => a.name.localeCompare(b.name));

  return (
    <div className="p-6 font-sans max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8 border-b-2 border-slate-100 pb-6">
        <div>
          <button 
            onClick={() => navigate('/admin/school-dashboard')}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors uppercase font-black text-[9px] tracking-widest mb-4"
          >
            <ChevronLeft size={12} strokeWidth={3} />
            Natrag na pregled
          </button>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Predmeti učenika</h1>
          <p className="text-slate-500 font-medium text-sm">Masovna dodjela i oslobađanje učenika od predmeta</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="md:col-span-1">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Odaberi razredni odjel</label>
          <select 
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="w-full bg-white border-2 border-slate-200 rounded-xl p-4 font-bold text-slate-900 outline-none focus:border-[#005c8d] transition-all shadow-sm"
          >
            <option value="">Odaberi razred...</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.schoolYear})</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Pretraži učenike</label>
          <div className="bg-white border-2 border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <Search size={20} className="text-slate-300" />
            <input 
              type="text" 
              placeholder="Ime učenika..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-900 w-full"
            />
          </div>
        </div>
      </div>

      {!selectedClassId ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Users size={32} className="text-slate-200" />
            </div>
            <p className="font-black text-slate-300 uppercase tracking-widest text-xs">Odaberite razredni odjel za nastavak</p>
        </div>
      ) : loading ? (
        <div className="p-20 text-center animate-pulse font-black uppercase text-slate-300 tracking-widest">Učitavanje podataka...</div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 w-64 border-r sticky left-0 bg-slate-50 z-10">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Učenik</span>
                </th>
                {subjects.map(s => (
                  <th key={s.id} className="p-4 border-r min-w-[120px] group relative">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-900 uppercase leading-none">{s.name}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{s.code}</span>
                    </div>
                    <button 
                      onClick={() => isAnyAdmin && assignAllToSubject(s.id)}
                      className={`absolute top-2 right-2 bg-slate-100 text-slate-400 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#005c8d] hover:text-white transition-all transform hover:scale-110 ${!isAnyAdmin && 'hidden'}`}
                      title="Dodijeli svima"
                    >
                      <Check size={10} strokeWidth={4} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.map((student, idx) => (
                <tr key={student.id} className="hover:bg-slate-50/50 group">
                  <td className="p-4 border-r font-black text-slate-900 uppercase text-[11px] tracking-tight flex items-center gap-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                    <span className="text-[10px] text-slate-300 w-4">{idx + 1}.</span>
                    {student.name}
                  </td>
                  {subjects.map(subject => {
                    const enrollment = enrollments.find(e => e.student_id === student.id && e.subject_id === subject.id);
                    const isActive = enrollment?.status === 'ACTIVE';
                    const isExempt = enrollment?.status === 'EXEMPT';
                    
                    return (
                      <td key={subject.id} className="p-4 border-r text-center">
                        <button 
                          onClick={() => toggleEnrollment(student.id, subject.id, enrollment?.status)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm mx-auto ${
                            isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                            isExempt ? 'bg-red-50 text-red-600 border border-red-100' : 
                            'bg-slate-50 text-slate-300 border border-slate-100 grayscale opacity-40 hover:grayscale-0 hover:opacity-100'
                          }`}
                        >
                          {isActive ? <CheckCircle2 size={20} /> : <XCircle size={18} />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <div className="p-20 text-center text-slate-300 font-bold uppercase text-xs tracking-widest">
              Nema učenika u ovom razredu
            </div>
          )}
        </div>
      )}

      {selectedClassId && !loading && subjects.length === 0 && (
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-8 flex items-center gap-4 text-amber-800">
           <BookOpen size={24} />
           <div>
             <p className="font-black uppercase text-xs tracking-widest mb-1">Ovaj razred nema dodijeljenih predmeta</p>
             <p className="text-[11px] font-bold">Prvo dodijelite predmete razredu u sekciji <button onClick={() => navigate(`/admin/razred-predmeti?classId=${selectedClassId}`)} className="underline">Predmeti razreda</button>.</p>
           </div>
        </div>
      )}
    </div>
  );
}
