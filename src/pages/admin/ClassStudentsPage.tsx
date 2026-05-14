import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { Class, User, Role } from '../../types';
import { 
  Plus, 
  Trash2, 
  ChevronLeft, 
  User as UserIcon,
  Search,
  UserPlus
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function ClassStudentsPage() {
  const { selectedSchoolId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');
  
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [classStudents, setClassStudents] = useState<User[]>([]);
  const [availableStudents, setAvailableStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => r.schoolId === selectedSchoolId && (r.role === Role.SCHOOL_ADMIN || r.role === Role.ADMIN));

  useEffect(() => {
    if (!selectedSchoolId || !classId) {
      navigate('/admin/razredi');
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
      if (clsError) throw clsError;
      setCurrentClass(cls);

      // Fetch Students in this class
      const { data: enrollments, error: sicError } = await supabase
        .from('student_class_enrollments')
        .select('*, student:user_profiles(*)')
        .eq('class_id', classId)
        .eq('status', 'ACTIVE');
      if (sicError) throw sicError;

      const mappedInClass = (enrollments || []).map(row => ({
        id: row.student.id,
        name: row.student.name?.split(' ')[0] || '',
        surname: row.student.name?.split(' ').slice(1).join(' ') || '',
        email: row.student.email,
        globalRole: Role.STUDENT
      })) as User[];
      
      setClassStudents(mappedInClass);

      // Fetch Available Students (students in this school who are not in THIS class enrollment)
      const { data: schoolStudents, error: ssError } = await supabase
        .from('user_school_roles')
        .select(`
          user_id,
          user:user_profiles (*)
        `)
        .eq('school_id', selectedSchoolId)
        .eq('role', Role.STUDENT);
      
      if (ssError) throw ssError;

      // Get all current enrollments to filter available students
      const { data: allEnrollments } = await supabase
        .from('student_class_enrollments')
        .select('student_id, class_id')
        .eq('status', 'ACTIVE');

      const mappedAvailable = (schoolStudents || [])
        .map((s: any) => s.user)
        .filter(u => u)
        .filter(u => {
          const enrollment = allEnrollments?.find(e => e.student_id === u.id);
          return !enrollment || enrollment.class_id !== classId;
        })
        .map((u: any) => {
          const enrollment = allEnrollments?.find(e => e.student_id === u.id);
          return {
            id: u.id,
            name: u.name?.split(' ')[0] || '',
            surname: u.name?.split(' ').slice(1).join(' ') || '',
            email: u.email,
            globalRole: Role.STUDENT,
            classId: enrollment?.class_id
          };
        });

      setAvailableStudents(mappedAvailable as any);

    } catch (err: any) {
      toast.error('Greška pri učitavanju');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignStudent = async (studentId: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za dodavanje učenika.');
      return;
    }

    console.log("ASSIGN STUDENT TO CLASS CLICKED", { classId, studentId });

    try {
      const schoolYear = currentClass?.schoolYear || '2025./2026.';
      const { data: enrollResult, error: enrollError } = await supabase
        .from('student_class_enrollments')
        .upsert([{ 
          student_id: studentId,
          class_id: classId,
          school_year: schoolYear,
          status: 'ACTIVE'
        }], { onConflict: 'student_id,class_id,school_year' })
        .select();
      
      console.log("STUDENT ENROLL RESULT:", { data: enrollResult, error: enrollError });

      if (enrollError) throw enrollError;

      // Also automatically enroll student in all subjects of this class
      const { data: assignments } = await supabase
        .from('class_subject_teachers')
        .select('subject_id')
        .eq('class_id', classId);
      
      console.log("FETCHED CLASS SUBJECTS FOR AUTO-ENROLLMENT:", assignments);

      if (assignments && assignments.length > 0) {
        const enrollments = assignments.map(a => ({
          student_id: studentId,
          subject_id: a.subject_id,
          class_id: classId,
          school_year: schoolYear,
          status: 'ACTIVE'
        }));
        const { data: subEnrollResult, error: subEnrollError } = await supabase
          .from('student_subject_enrollments')
          .upsert(enrollments, { onConflict: 'student_id,subject_id,class_id,school_year' })
          .select();
        
        console.log("STUDENT SUBJECT ENROLL RESULT:", { data: subEnrollResult, error: subEnrollError });
      }

      toast.success('Učenik dodan u razred');
      fetchData();
    } catch (err: any) {
      console.error("ASSIGN STUDENT FAILED:", err);
      toast.error('Greška pri dodavanju učenika: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za uklanjanje učenika.');
      return;
    }

    console.log("REMOVE STUDENT FROM CLASS CLICKED", { classId, studentId });

    if (!window.confirm('Želite li ukloniti učenika iz razreda?')) return;
    try {
      const { data: remEnrollResult, error: remEnrollError } = await supabase
        .from('student_class_enrollments')
        .update({ status: 'DROPPED' })
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .select();
      
      console.log("REMOVE CLASS ENROLL RESULT:", { data: remEnrollResult, error: remEnrollError });
      
      if (remEnrollError) throw remEnrollError;

      // Note: we might want to keep the grades but deactivate enrollment
      const { data: remSubResult, error: remSubError } = await supabase
        .from('student_subject_enrollments')
        .update({ status: 'DROPPED' })
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .select();
        
      console.log("REMOVE SUBJECT ENROLL RESULT:", { data: remSubResult, error: remSubError });

      toast.success('Učenik uklonjen iz razreda');
      fetchData();
    } catch (err: any) {
      console.error("REMOVE STUDENT FAILED:", err);
      toast.error('Greška pri uklanjanju učenika: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const filteredAvailable = availableStudents.filter(s => 
    `${s.name} ${s.surname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-10 font-black uppercase text-slate-300 animate-pulse text-center">Učitavanje...</div>;

  return (
    <div className="p-6 font-sans max-w-7xl mx-auto">
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
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-black">
              {currentClass?.name}
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Učenici u razredu</h1>
          </div>
          <p className="text-slate-500 font-medium text-sm">Upravljanje popisom učenika za razredni odjel</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Available Students */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Dostupni učenici</h2>
            <div className="bg-white border rounded-lg px-3 py-1 flex items-center gap-2">
              <Search size={14} className="text-slate-300" />
              <input 
                type="text" 
                placeholder="Traži..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="text-xs font-bold outline-none bg-transparent w-32"
              />
            </div>
          </div>
          
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
            <table className="w-full text-left border-collapse">
              <tbody className="divide-y divide-slate-50">
                {filteredAvailable.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50 group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                          <UserIcon size={14} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{s.surname} {s.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-black">{s.classId ? 'Već u drugom razredu' : 'Nije raspoređen'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {isAnyAdmin && (
                        <button 
                          onClick={() => handleAssignStudent(s.id)}
                          className="bg-blue-50 text-[#005c8d] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-[#005c8d] hover:text-white"
                        >
                          <UserPlus size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredAvailable.length === 0 && (
                  <tr>
                    <td className="p-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.2em]">
                      Nema dostupnih učenika
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Current Students */}
        <div className="space-y-4">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#005c8d]">Popis razreda ({classStudents.length})</h2>
          
          <div className="bg-white rounded-3xl border-2 border-[#005c8d]/10 shadow-xl overflow-hidden min-h-[400px]">
            <table className="w-full text-left border-collapse">
              <tbody className="divide-y divide-slate-50">
                {classStudents.sort((a,b) => a.surname.localeCompare(b.surname)).map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 group">
                    <td className="p-4 w-12 text-center text-[10px] font-black text-slate-300 border-r">{idx + 1}.</td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#005c8d]/10 text-[#005c8d] rounded-full flex items-center justify-center">
                          <UserIcon size={14} />
                        </div>
                        <p className="font-black text-slate-900 text-sm tracking-tight uppercase">{s.surname} {s.name}</p>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {isAnyAdmin && (
                        <button 
                          onClick={() => handleRemoveStudent(s.id)}
                          className="p-2 text-slate-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {classStudents.length === 0 && (
                  <tr>
                    <td className="p-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.2em]">
                      Razred je prazan
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
