import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Subject, User, Role } from '../../types';
import { 
  Plus, 
  Trash2, 
  ChevronLeft, 
  BookOpen, 
  GraduationCap, 
  User as UserIcon,
  Search
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

export default function ClassSubjectsPage() {
  const { selectedSchoolId } = useSelection();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');
  
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Assign State
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');

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

      // Fetch Assignments
      const { data: assignData, error: assignError } = await supabase
        .from('class_subject_teachers')
        .select(`
          id,
          subject:subjects (*),
          teacher:user_profiles (*)
        `)
        .eq('class_id', classId);
      if (assignError) throw assignError;
      setAssignments(assignData || []);

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
      
      const uniqueTeachers = Array.from(new Set((teachData || []).map(t => t.user))).filter(Boolean);
      setTeachers(uniqueTeachers as any[]);

    } catch (err: any) {
      toast.error('Greška pri učitavanju');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId || !selectedTeacherId) {
      toast.error('Odaberite predmet i nastavnika');
      return;
    }

    try {
      const { error } = await supabase.from('class_subject_teachers').insert([{
        class_id: classId,
        subject_id: selectedSubjectId,
        teacher_id: selectedTeacherId,
        school_id: selectedSchoolId
      }]);

      if (error) {
        if (error.code === '23505') throw new Error('Ovaj predmet je već dodijeljen ovom razredu.');
        throw error;
      }

      toast.success('Predmet dodijeljen razredu');
      setSelectedSubjectId('');
      setSelectedTeacherId('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    if (!window.confirm('Želite li ukloniti ovaj predmet iz razreda?')) return;
    try {
      const { error } = await supabase.from('class_subject_teachers').delete().eq('id', id);
      if (error) throw error;
      toast.success('Predmet uklonjen');
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

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
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black">
              {currentClass?.name}
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Predmeti razreda</h1>
          </div>
          <p className="text-slate-500 font-medium text-sm">Dodjela nastavnih predmeta i njihovih izvođača razrednom odjelu</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Assignment Form */}
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
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
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

        {/* List of Subjects */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <th className="p-4">Predmet</th>
                  <th className="p-4">Nastavnik</th>
                  <th className="p-4 text-right">Akcije</th>
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
                          <p className="font-black text-slate-900 uppercase text-xs tracking-tight">{item.subject?.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{item.subject?.code}</p>
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
                      <button 
                        onClick={() => handleRemoveAssignment(item.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
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
    </div>
  );
}
