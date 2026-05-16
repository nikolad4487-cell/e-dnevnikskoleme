import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Role } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Edit2, Trash2, GraduationCap, ChevronLeft, Search, BookOpen, Users, LayoutGrid } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function ClassManagementPage() {
  const { selectedSchoolId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [classes, setClasses] = useState<Class[]>([]);
  const setClassesUnified = (newClasses: Class[]) => {
    // Deduplicate by ID and replace
    const uniqueClasses = Array.from(
      new Map(newClasses.map(c => [c.id, c])).values()
    );
    setClasses(uniqueClasses);
  };
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => r.schoolId === selectedSchoolId && (r.role === Role.SCHOOL_ADMIN || r.role === Role.ADMIN));

  // Form State
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState(1);
  const [section, setSection] = useState('A');
  const [schoolYear, setSchoolYear] = useState('2024/2025');
  const [homeroomTeacherId, setHomeroomTeacherId] = useState('');
  const [deputyHomeroomTeacherId, setDeputyHomeroomTeacherId] = useState('');
  const [programId, setProgramId] = useState('');
  const [variant, setVariant] = useState<string>('REGULAR');
  const [programs, setPrograms] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedSchoolId) {
      navigate('/admin/schools');
      return;
    }
    fetchData();
  }, [selectedSchoolId]);

  useEffect(() => {
    if (searchParams.get('openModal') === 'true' && isAnyAdmin) {
      setIsModalOpen(true);
    }
  }, [searchParams, isAnyAdmin]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch Classes from view to avoid current-year duplicates
      const { data: classData, error: classError } = await supabase
        .from('active_classes_current_year')
        .select(`
          *,
          homeroom:user_profiles!classes_homeroom_teacher_id_fkey(*),
          deputy:user_profiles!classes_deputy_teacher_id_fkey(*)
        `)
        .eq('school_id', selectedSchoolId)
        .order('grade_level')
        .order('section');
      
      if (classError) throw classError;
      setClassesUnified(mapList(classData || [], mappers.class));

      // Fetch potential homeroom teachers
      const { data: teacherData, error: teacherError } = await supabase
        .from('user_school_roles')
        .select(`
          user:user_profiles (*)
        `)
        .eq('school_id', selectedSchoolId)
        .in('role', [Role.TEACHER, Role.HOMEROOM, Role.SCHOOL_ADMIN]);

      if (teacherError) throw teacherError;
      const uniqueTeachers = Array.from(new Set((teacherData || []).map(t => t.user))).filter(Boolean);
      setTeachers(uniqueTeachers as any[]);

      // Fetch Programs
      const { data: progData } = await supabase.from('programs').select('*').eq('school_id', selectedSchoolId);
      setPrograms(progData || []);

    } catch (err: any) {
      toast.error('Greška pri učitavanju podataka');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (cls?: Class) => {
    if (!isAnyAdmin) {
      toast.error('Ova akcija je dopuštena samo administratorima.');
      return;
    }
    if (cls) {
      setEditingClass(cls);
      setName(cls.name);
      setGradeLevel(cls.gradeLevel || 1);
      setSection(cls.section || 'A');
      setSchoolYear(cls.schoolYear || '2024/2025');
      setHomeroomTeacherId(cls.homeroomTeacherId || '');
      setDeputyHomeroomTeacherId(cls.deputyTeacherId || '');
      setProgramId(cls.programId || '');
      setVariant(cls.classVariant || 'REGULAR');
    } else {
      setEditingClass(null);
      setName('');
      setGradeLevel(1);
      setSection('A');
      setSchoolYear('2024/2025');
      setHomeroomTeacherId('');
      setDeputyHomeroomTeacherId('');
      setProgramId('');
      setVariant('REGULAR');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAnyAdmin) {
      console.warn("Attempted class create/update without admin permissions");
      return;
    }
    
    let finalGradeLevel = Number(gradeLevel);
    let finalSection = section.toUpperCase();
    let finalName = name || `${finalGradeLevel}.${finalSection}`;

    if (variant === 'REGULAR') {
      finalGradeLevel = Number(gradeLevel);
      finalSection = section.toUpperCase();
      finalName = name || `${finalGradeLevel}.${finalSection}`;
    } else if (variant === 'CONTINUATION_FREE') {
      finalGradeLevel = 4;
      finalSection = 'K';
      finalName = '4.K';
    } else if (variant === 'CONTINUATION_PAID') {
      finalGradeLevel = 4;
      finalSection = section.toUpperCase();
      finalName = `4.${finalSection}`;
    }

    const payload = {
      name: finalName,
      grade_level: finalGradeLevel,
      section: finalSection,
      school_year: schoolYear,
      school_id: selectedSchoolId,
      status: 'ACTIVE',
      homeroom_teacher_id: homeroomTeacherId || null,
      deputy_teacher_id: deputyHomeroomTeacherId || null,
      program_id: programId || null,
      variant: variant
    };

    if (!homeroomTeacherId) {
      toast.error('Odaberite razrednika.');
      return;
    }

    console.log(`${editingClass ? 'UPDATE' : 'CREATE'} CLASS CLICKED`, payload);

    try {
      if (editingClass) {
        const { data, error } = await supabase.from('classes').update(payload).eq('id', editingClass.id).select();
        console.log("UPDATE CLASS RESULT:", { data, error });
        if (error) throw error;
        toast.success('Razredni odjel ažuriran');
      } else {
        const { data, error } = await supabase.from('classes').insert([payload]).select();
        console.log("CREATE CLASS RESULT:", { data, error });
        if (error) throw error;
        toast.success('Razredni odjel dodan');
      }
      
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error("CLASS ACTION FAILED:", err);
      toast.error('Greška pri spremanju razreda: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za brisanje razreda.');
      return;
    }

    console.log("DELETE CLASS CLICKED", { classId });

    const confirmMsg = isMainAdmin 
      ? 'Jeste li sigurni da želite obrisati ovaj razredi i SVE povezane podatke? Ova radnja je trajna.'
      : 'Jeste li sigurni da želite obrisati ovaj razred?';

    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      if (isMainAdmin) {
        console.log("PERFORMING CASCADE DELETE AS MAIN ADMIN for class:", classId);
        // Cascade delete helpers
        const results = await Promise.all([
          supabase.from('grades').delete().eq('class_id', classId),
          supabase.from('absences').delete().eq('class_id', classId),
          supabase.from('lessons').delete().eq('class_id', classId),
          supabase.from('schedule_cells').delete().eq('class_id', classId),
          supabase.from('student_class_enrollments').delete().eq('class_id', classId),
          supabase.from('student_subject_enrollments').delete().eq('class_id', classId),
          supabase.from('curriculum_plans').delete().eq('class_id', classId),
          supabase.from('class_subject_teachers').delete().eq('class_id', classId),
        ]);
        console.log("CASCADE DELETE RESULTS:", results);
        
        const { data, error } = await supabase.from('classes').delete().eq('id', classId).select();
        console.log("FINAL CLASS DELETE RESULT:", { data, error });
        if (error) throw error;
        toast.success('Razred i povezani podaci obrisani.');
      } else {
        const { data, error } = await supabase.from('classes').delete().eq('id', classId).select();
        console.log("REGULAR CLASS DELETE RESULT:", { data, error });
        if (error) {
           if (error.message?.includes('foreign key constraint')) {
             toast.error('Razred sadrži podatke. Samo glavni administrator ga može obrisati.');
           } else {
             throw error;
           }
        } else {
          toast.success('Razred obrisan.');
        }
      }
      fetchData();
    } catch (err: any) {
      console.error("DELETE CLASS FAILED:", err);
      toast.error('Brisanje nije uspjelo: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setLoading(false);
    }
  };

  const filteredClasses = classes.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAllowedProgramTypes = (variantVal: string) => {
    if (variantVal === 'REGULAR') {
      return ['VOCATIONAL_3Y', 'COMMERCIALIST_4Y'];
    }
    if (variantVal === 'CONTINUATION_FREE') {
      return ['CONTINUATION_FREE'];
    }
    if (variantVal === 'CONTINUATION_PAID') {
      return ['CONTINUATION_PAID'];
    }
    return [];
  };

  const filteredPrograms = programs.filter(program =>
    getAllowedProgramTypes(variant).includes(program.type)
  );

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
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Razredni odjeli</h1>
          <p className="text-slate-500 font-medium text-sm">Upravljanje razredima u ovoj školskoj godini</p>
        </div>
        
        {isAnyAdmin && (
          <button 
            onClick={() => handleOpenModal()}
            className="bg-[#005c8d] text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-[#004a71] transition-all shadow-lg"
          >
            <Plus size={18} strokeWidth={3} />
            Novi razred
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 flex items-center gap-4">
        <Search className="text-slate-300" size={20} />
        <input 
          type="text" 
          placeholder="Pretraži po nazivu razreda..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="bg-transparent border-none outline-none font-bold text-slate-900 w-full"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 font-sans">
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Naziv</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Godina</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Razrednik</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Akcije</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredClasses.map((cls) => (
              <tr key={cls.id} className="hover:bg-slate-50 transition-colors group">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 text-[#005c8d] rounded-lg flex items-center justify-center font-black">
                      {cls.name}
                    </div>
                    <div>
                      <div className="font-black text-slate-900">{cls.name}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{cls.grade_level}. razred</div>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-bold text-slate-600">{cls.school_year}</td>
                <td className="p-4">
                  <span className="font-bold text-slate-700">
                    {(cls as any).homeroom?.name || '—'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => navigate(`/class/${cls.id}`)}
                      className="p-2 text-[#005c8d] hover:bg-[#005c8d]/10 transition-colors"
                      title="Pregled razreda (Dnevnik)"
                    >
                      <LayoutGrid size={18} strokeWidth={3} />
                    </button>
                    <button 
                      onClick={() => navigate(`/admin/razred-ucenici?classId=${cls.id}`)}
                      className="p-2 text-slate-400 hover:text-emerald-500 transition-colors"
                      title="Učenici u razredu"
                    >
                      <Users size={18} />
                    </button>
                    <button 
                      onClick={() => navigate(`/admin/razred-predmeti?classId=${cls.id}`)}
                      className="p-2 text-slate-400 hover:text-[#005c8d] transition-colors"
                      title="Predmeti i nastavnici"
                    >
                      <BookOpen size={18} />
                    </button>
                    {isAnyAdmin && (
                      <button 
                        onClick={() => handleOpenModal(cls)}
                        className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                    )}
                    {isAnyAdmin && (
                      <button 
                        onClick={() => handleDeleteClass(cls.id)}
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredClasses.length === 0 && (
              <tr>
                <td colSpan={4} className="p-12 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                  Nema pronađenih razreda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-[#005c8d] p-8 text-white">
              <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">
                {editingClass ? 'Uredi razred' : 'Novi razredni odjel'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Razred (npr. 1)</label>
                  <input 
                    type="number" 
                    min="1" max="8"
                    value={variant.startsWith('CONTINUATION') ? 4 : gradeLevel}
                    onChange={e => setGradeLevel(parseInt(e.target.value))}
                    disabled={variant.startsWith('CONTINUATION')}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Odjel (npr. A)</label>
                  <input 
                    type="text" 
                    value={variant === 'CONTINUATION_FREE' ? 'K' : section}
                    onChange={e => setSection(e.target.value)}
                    disabled={variant === 'CONTINUATION_FREE'}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Naziv (opcionalno)</label>
                <input 
                  type="text" 
                  value={
                    variant === 'CONTINUATION_FREE' ? '4.K' : 
                    (variant === 'CONTINUATION_PAID' ? `4.${section.toUpperCase()}` : name)
                  }
                  placeholder={`${gradeLevel}.${section}`}
                  onChange={e => setName(e.target.value)}
                  disabled={variant.startsWith('CONTINUATION')}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Školska godina</label>
                <input 
                  type="text" 
                  value={schoolYear}
                  onChange={e => setSchoolYear(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Program / Smjer</label>
                <select 
                  value={programId}
                  onChange={e => setProgramId(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                >
                  <option value="">Nema programa...</option>
                  {filteredPrograms.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Varijanta nastave</label>
                <select 
                  value={variant}
                  onChange={e => {
                    const val = e.target.value;
                    setVariant(val);
                    setProgramId('');
                    if (val === 'CONTINUATION_FREE') {
                      setGradeLevel(4);
                      setSection('K');
                      setName('4.K');
                    } else if (val === 'CONTINUATION_PAID') {
                      setGradeLevel(4);
                      setName(`4.${section.toUpperCase()}`);
                    }
                  }}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                >
                  <option value="REGULAR">Redovni program</option>
                  <option value="CONTINUATION_FREE">Nastavak / Razlika - besplatni</option>
                  <option value="CONTINUATION_PAID">Nastavak / Razlika - plaćeni</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Razrednik <span className="text-red-500">*</span></label>
                <select 
                  value={homeroomTeacherId}
                  onChange={e => setHomeroomTeacherId(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                  required
                >
                  <option value="">Odaberi nastavnika...</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{(t as any).name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Zamjenik razrednika</label>
                <select 
                  value={deputyHomeroomTeacherId}
                  onChange={e => setDeputyHomeroomTeacherId(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                >
                  <option value="">Odaberi nastavnika (opcionalno)...</option>
                  {teachers.filter(t => t.id !== homeroomTeacherId).map(t => (
                    <option key={t.id} value={t.id}>{(t as any).name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black uppercase tracking-widest text-[10px]"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#005c8d] text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg"
                >
                  Spremi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
