import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatPersonName, matchesSearch, sortPeopleBySurname } from '../../lib/utils';
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
  const [deleteDialog, setDeleteDialog] = useState<{isOpen: boolean, classId: string}>({isOpen: false, classId: ''});

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
  const [schoolYears, setSchoolYears] = useState<any[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
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
      
      // Fetch Classes directly from table to ensure we see all for this school
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          *,
          program:program_id(*),
          homeroom:homeroom_teacher_id(*),
          deputy:deputy_teacher_id(*),
          school_year_relation:school_year_id(*)
        `)
        .eq('school_id', selectedSchoolId)
        .order('grade_level')
        .order('section');
      
      if (classError) {
        console.error('LOAD ADMIN CLASSES ERROR:', classError);
        throw classError;
      }
      setClassesUnified(mapList(classData || [], mappers.class));

      // Fetch School Years
      const { data: yearsData } = await supabase
        .from('school_years')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('name', { ascending: false });
      setSchoolYears(yearsData || []);

      // Fetch potential homeroom teachers
      const { data: teacherData, error: teacherError } = await supabase
        .from('user_school_roles')
        .select(`
          user:user_profiles (*)
        `)
        .eq('school_id', selectedSchoolId)
        .in('role', [Role.TEACHER, Role.HOMEROOM, Role.SCHOOL_ADMIN]);

      if (teacherError) throw teacherError;
      const rawUserList = (teacherData || []).map(t => t.user).filter(Boolean);
      const uniqueTeachers = rawUserList.filter((item: any, index: number, self: any[]) => 
        self.findIndex((t: any) => t.id === item.id) === index
      );
      setTeachers(sortPeopleBySurname(uniqueTeachers) as any[]);

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
      setSelectedYearId(cls.school_year_id || '');
      setHomeroomTeacherId(cls.homeroomTeacherId || '');
      setDeputyHomeroomTeacherId(cls.deputyTeacherId || '');
      setProgramId(cls.programId || '');
      setVariant(cls.classVariant || 'REGULAR');
    } else {
      setEditingClass(null);
      setName('');
      setGradeLevel(1);
      setSection('A');
      // Default to the first found year if available
      if (schoolYears.length > 0) {
        setSelectedYearId(schoolYears[0].id);
        setSchoolYear(schoolYears[0].name);
      } else {
        setSchoolYear('2024/2025');
        setSelectedYearId('');
      }
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
      school_year_id: selectedYearId,
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
      // PRE-INSERT CHECK: Check if class with same name already exists in this school year
      const { data: existingClass, error: checkError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_year_id', selectedYearId)
        .eq('name', finalName)
        .maybeSingle();
      
      if (existingClass && (!editingClass || existingClass.id !== editingClass.id)) {
        toast.error(`Razred ${finalName} već postoji u ovoj školskoj godini.`);
        return;
      }

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
    setDeleteDialog({ isOpen: true, classId });
  };

  const confirmDeleteClass = async () => {
    if (!deleteDialog.classId) return;
    const classId = deleteDialog.classId;

    setDeleteDialog({ isOpen: false, classId: '' });

    try {
      setLoading(true);
      console.log("DELETE CLASS START", classId);

      let deleteError = null;

      if (isMainAdmin) {
        console.log("PERFORMING CASCADE DELETE AS MAIN ADMIN for class:", classId);
        // Cascade delete helpers
        await Promise.all([
          supabase.from('grades').delete().eq('class_id', classId),
          supabase.from('absences').delete().eq('class_id', classId),
          supabase.from('lessons').delete().eq('class_id', classId),
          supabase.from('schedule_cells').delete().eq('class_id', classId),
          supabase.from('student_class_enrollments').delete().eq('class_id', classId),
          supabase.from('student_subject_enrollments').delete().eq('class_id', classId),
          supabase.from('curriculum_plans').delete().eq('class_id', classId),
          supabase.from('class_subject_teachers').delete().eq('class_id', classId),
        ]);
      }

      const { data, error } = await supabase
        .from("classes")
        .delete()
        .eq("id", classId)
        .select();

      console.log("DELETE CLASS RESULT", { data, error });

      if (error) {
         if (error.message?.includes('foreign key constraint') || error.code === '23503') {
           toast.error('Razred sadrži podatke. Najprije uklonite ili premjestite povezane podatke.');
         } else {
           throw new Error(error.message || 'Server error');
         }
      } else {
        toast.success('Razred je obrisan.');
        fetchData();
      }
    } catch (err: any) {
      console.error("DELETE CLASS FAILED:", err);
      toast.error('Brisanje nije uspjelo: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setLoading(false);
    }
  };

  const filteredClasses = classes.filter(c => 
    matchesSearch(c.name, searchTerm)
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
    <div className="p-6 font-sans w-full">
      <div className="flex justify-between items-end mb-8 border-b-2 border-slate-100 pb-6">
        <div>
          <button 
            onClick={() => navigate('/admin-skole')}
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

      {deleteDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6">
             <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">Potvrda brisanja</h3>
             <p className="text-slate-500 font-medium mb-6">
               {isMainAdmin 
                 ? 'Jeste li sigurni da želite obrisati ovaj razred i SVE povezane podatke? Ova radnja je trajna.' 
                 : 'Jeste li sigurni da želite obrisati ovaj razred?'}
             </p>
             <div className="flex gap-3">
               <button 
                 onClick={() => setDeleteDialog({ isOpen: false, classId: '' })}
                 disabled={loading}
                 className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
               >
                 Odustani
               </button>
               <button 
                 onClick={confirmDeleteClass}
                 disabled={loading}
                 className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
               >
                 {loading ? 'Brisanje...' : 'Obriši'}
               </button>
             </div>
           </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 font-sans">
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Naziv</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Godina</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Razrednik</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Zamjenik razrednika</th>
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
                <td className="p-4 font-bold text-slate-600">
                  <div className="flex flex-col">
                    <span>{cls.schoolYear || cls.schoolYearName || '—'}</span>
                    {cls.schoolYearIsActive === false && (
                      <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider w-fit mt-1">ARHIVA</span>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <span className="font-bold text-slate-700">
                    {(cls as any).homeroom?.name || '—'}
                  </span>
                </td>
                <td className="p-4">
                  <span className="font-bold text-slate-700">
                    {(cls as any).deputy?.name || '—'}
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
                <select 
                  value={selectedYearId}
                  onChange={e => {
                    setSelectedYearId(e.target.value);
                    const year = schoolYears.find(y => y.id === e.target.value);
                    if (year) setSchoolYear(year.name);
                  }}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                  required
                >
                  <option value="">Odaberi godinu...</option>
                  {schoolYears.map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
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
                    <option key={t.id} value={t.id}>{formatPersonName(t)}</option>
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
                    <option key={t.id} value={t.id}>{formatPersonName(t)}</option>
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
