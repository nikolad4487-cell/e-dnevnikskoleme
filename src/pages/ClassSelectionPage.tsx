import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { Class, Role, SchoolYear } from '../types';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, Calendar, ChevronLeft, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

interface ClassWithDetails {
  id: string;
  name: string;
  gradeLevel: number;
  section: string;
  schoolId: string;
  yearId: string;
  yearName: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  homeroomTeacherName?: string;
  userRoleInClass?: 'HOMEROOM' | 'DEPUTY' | 'TEACHER' | 'ADMIN' | 'STUDENT';
  programName?: string;
}

export default function ClassSelectionPage() {
  const { user, isParent, isStaff, isMainAdmin, userSchoolRoles } = useAuth();
  const { setSelectedClassId, setIsArchived, setSelectedSchoolId, selectedSchoolId, selectedChildId } = useSelection();
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Current roles in selected school
  const currentSchoolRoles = userSchoolRoles.filter(r => r.schoolId === selectedSchoolId).map(r => r.role);
  const isSchoolAdmin = isMainAdmin || currentSchoolRoles.includes(Role.SCHOOL_ADMIN) || currentSchoolRoles.includes(Role.ADMIN);

  useEffect(() => {
    const init = async () => {
      if (!selectedSchoolId) return;
      setLoading(true);
      await fetchSchoolYears();
      if (isStaff) {
        await fetchStaffClasses();
      } else {
        await fetchEnrollments();
      }
      setLoading(false);
    };
    init();
  }, [user, selectedSchoolId, selectedChildId, isStaff]);

  useEffect(() => {
    console.log("DEBUG: selectedSchoolId", selectedSchoolId);
    console.log("DEBUG: selectedYearId", selectedYearId);
    console.log("DEBUG: schoolYears", schoolYears);
  }, [selectedSchoolId, selectedYearId, schoolYears]);

  const fetchSchoolYears = async () => {
    if (!selectedSchoolId) return;
    try {
      const { data, error } = await supabase
        .from('school_years')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('starts_at', { ascending: false });
      
      if (error) throw error;
      if (data) {
        const years = data.map(y => ({
          id: y.id,
          name: y.name,
          startsAt: y.starts_at,
          endsAt: y.ends_at,
          isActive: y.is_active,
          schoolId: y.school_id,
          status: y.status
        }));
        setSchoolYears(years);
        
        // Default to active year
        const activeYear = years.find(y => y.isActive);
        if (activeYear) {
          setSelectedYearId(activeYear.id);
        } else if (years.length > 0) {
          setSelectedYearId(years[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching school years:', error);
    }
  };

  const fetchStaffClasses = async () => {
    if (!user || !selectedSchoolId) return;
    
    try {
      console.log('[CLASSES] Fetching staff classes for school:', selectedSchoolId);
      
      // 1. Get all classes for school
      const { data: allClassData, error: classError } = await supabase
        .from('classes')
        .select(`
          *,
          homeroom:user_profiles!classes_homeroom_teacher_id_fkey(name),
          deputy:user_profiles!classes_deputy_teacher_id_fkey(name)
        `)
        .eq('school_id', selectedSchoolId);

      if (classError) {
        console.error("CLASSES QUERY ERROR (Staff):", classError);
        throw classError;
      }
      console.log("DEBUG: classes query result (raw count)", allClassData?.length);
      if (allClassData && allClassData.length > 0) {
        console.log("DEBUG: First class row:", allClassData[0]);
      }

      // 2. Get assignments if teacher (to filter if not admin)
      let assignedClassIds: string[] = [];
      if (!isSchoolAdmin) {
        const { data: assignments } = await supabase
          .from('class_subject_teachers')
          .select('class_id')
          .eq('teacher_id', user.id);
        
        assignedClassIds = (assignments || []).map(a => a.class_id);
      }

      const classesData: ClassWithDetails[] = (allClassData || [])
        .filter(cls => {
          if (isSchoolAdmin) return true;
          return cls.homeroom_teacher_id === user.id || 
                 cls.deputy_teacher_id === user.id || 
                 assignedClassIds.includes(cls.id);
        })
        .map(cls => {
          let role: 'HOMEROOM' | 'DEPUTY' | 'TEACHER' | 'ADMIN' = 'TEACHER';
          if (isSchoolAdmin) role = 'ADMIN';
          if (cls.homeroom_teacher_id === user.id) role = 'HOMEROOM';
          else if (cls.deputy_teacher_id === user.id) role = 'DEPUTY';

          return {
            id: cls.id,
            name: cls.name,
            gradeLevel: cls.grade_level,
            section: cls.section,
            schoolId: cls.school_id,
            yearId: String(cls.school_year_id || ''), // Ensure string
            yearName: cls.school_year,
            status: cls.status,
            homeroomTeacherId: cls.homeroom_teacher_id,
            homeroomTeacherName: (cls.homeroom as any)?.name || 'Nije dodijeljen',
            userRoleInClass: role as any,
            programName: cls.program_type || `${cls.grade_level}. razred`
          } as any;
        });

      setClasses(classesData);
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju razreda');
    }
  };

  const fetchEnrollments = async () => {
    if (!user) return;

    try {
      let studentId = user.id;
      
      if (isParent && selectedChildId) {
        studentId = selectedChildId;
      }

      const { data: enrollments, error } = await supabase
        .from('student_class_enrollments')
        .select(`
          id,
          status,
          class_id,
          classes!inner (
            id,
            name,
            grade_level,
            section,
            school_id,
            school_year_id,
            school_year,
            homeroom_teacher_id,
            homeroom:user_profiles!classes_homeroom_teacher_id_fkey(name),
            deputy:user_profiles!classes_deputy_teacher_id_fkey(name)
          )
        `)
        .eq('student_id', studentId);

      if (error) {
        console.error("ENROLLMENT QUERY ERROR:", error);
        throw error;
      }

      // Group by class_id to get only unique classes student is enrolled in
      const classesData: ClassWithDetails[] = [];
      const seenClasses = new Set<string>();

      (enrollments || []).forEach((env: any) => {
        if (!seenClasses.has(env.class_id) && (!selectedSchoolId || env.classes?.school_id === selectedSchoolId)) {
          seenClasses.add(env.class_id);
          classesData.push({
            id: env.classes.id,
            name: env.classes.name,
            gradeLevel: env.classes.grade_level,
            section: env.classes.section,
            schoolId: env.classes.school_id,
            yearId: String(env.classes.school_year_id || ''),
            yearName: env.classes.school_year,
            status: env.status,
            homeroomTeacherId: env.classes.homeroom_teacher_id,
            homeroomTeacherName: env.classes.homeroom?.name || 'Nije dodijeljen',
            userRoleInClass: 'STUDENT',
            programName: env.classes.program_type || `${env.classes.grade_level}. razred`
          } as any);
        }
      });

      setClasses(classesData);
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju razreda');
    }
  };

  const filteredClasses = classes.filter(cls => {
    // Exact match by ID
    if (cls.yearId === selectedYearId) return true;
    
    // Fallback match by school_year name if yearId is blank/null
    const selectedYear = schoolYears.find(y => y.id === selectedYearId);
    if (!cls.yearId && selectedYear && cls.yearName === selectedYear.name) return true;
    
    return false;
  });

  const selectedYear = schoolYears.find(y => y.id === selectedYearId);

  const handleCreateClass = async () => {
    if (!isSchoolAdmin || !selectedSchoolId || !selectedYear) return;
    
    const name = prompt('Unesite naziv razreda (npr. 1.A):');
    if (!name) return;

    try {
      // Basic 1.A parsing
      const grade = parseInt(name.split('.')[0]) || 1;
      const section = name.split('.').pop() || 'A';

      const { data, error } = await supabase
        .from('classes')
        .insert({
          school_id: selectedSchoolId,
          school_year_id: selectedYear.id,
          school_year: selectedYear.name,
          name: name,
          grade_level: grade,
          section: section,
          status: 'ACTIVE'
        })
        .select()
        .single();

      if (error) throw error;
      toast.success(`Razred ${name} uspješno kreiran.`);
      await fetchStaffClasses();
    } catch (error: any) {
      console.error('Error creating class:', error);
      toast.error(error.message || 'Greška pri kreiranju razreda');
    }
  };

  const handleSelect = (cls: ClassWithDetails) => {
    setSelectedClassId(cls.id);
    setSelectedSchoolId(cls.schoolId);
    setIsArchived(cls.status !== 'ACTIVE' || selectedYear?.status === 'ARCHIVED');
    
    if (isStaff) {
      navigate(`/class/${cls.id}`);
    } else {
      navigate('/student/ocjene');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#005c8d] mb-4" />
        <p className="text-slate-500 font-medium">Učitavanje popisa razreda...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <div className="max-w-5xl mx-auto py-12 px-6">
        <div className="flex justify-between items-center mb-8">
          <button 
            onClick={() => navigate('/select-school')}
            className="text-[10px] font-black uppercase text-slate-400 hover:text-[#005c8d] transition-colors flex items-center gap-1 bg-white border border-slate-200 px-4 py-2"
          >
            <ChevronLeft size={14} />
            Promijeni školu
          </button>

          {isSchoolAdmin && (
            <button 
              onClick={() => navigate('/admin/school-dashboard')}
              className="text-[10px] font-black uppercase text-white bg-[#005c8d] hover:bg-[#004a70] transition-colors flex items-center gap-2 px-6 py-2 shadow-sm"
            >
              Administracija škole
              <ArrowRight size={14} />
            </button>
          )}
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tight mb-2">Odabir razreda</h1>
          <div className="w-12 h-1 bg-[#005c8d] mx-auto opacity-20"></div>
          {isStaff && (
            <p className="text-[10px] text-slate-500 uppercase font-bold mt-4 tracking-widest">
              Zaposlenik: {user?.name} {user?.surname}
            </p>
          )}
        </div>

        {/* School Year Selector */}
        <div className="mb-6 flex flex-col items-center">
          <label className="text-[10px] font-black uppercase text-slate-500 mb-1 tracking-wider">Školska godina:</label>
          <div className="relative inline-block">
            <select
              value={selectedYearId}
              onChange={(e) => setSelectedYearId(e.target.value)}
              className="appearance-none bg-white border-2 border-[#005c8d] text-[#005c8d] font-black px-10 py-2 rounded-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#005c8d]/20 transition-all hover:bg-slate-50 min-w-[180px]"
            >
              {schoolYears.map(y => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#005c8d]" size={16} />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#005c8d]">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#dee2e6] rounded-sm shadow-sm overflow-hidden">
          <div className="bg-[#f1f3f5] px-6 py-4 border-b border-[#dee2e6] flex justify-between items-center">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#005c8d]">Odaberite razrednu knjigu</h2>
            {isSchoolAdmin && (
              <button 
                onClick={handleCreateClass}
                className="text-[9px] font-black uppercase bg-[#005c8d] text-white px-3 py-1 hover:bg-[#004a70] transition-colors flex items-center gap-1"
              >
                <Plus size={12} />
                Novi razred
              </button>
            )}
          </div>

          {filteredClasses.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="w-16 h-16 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar size={32} />
              </div>
              <p className="text-slate-400 italic mb-6">Nema pronađenih razreda za odabranu školsku godinu.</p>
              {isSchoolAdmin && (
                <button 
                  onClick={handleCreateClass}
                  className="inline-flex items-center gap-2 bg-[#005c8d] text-white px-8 py-3 rounded-sm font-black uppercase text-[10px] tracking-widest hover:bg-[#004a70] transition-all shadow-md active:scale-95"
                >
                  <Plus size={16} />
                  Dodaj razred u ovu školsku godinu
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#dee2e6]">
              {filteredClasses
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((cls) => (
                  <div 
                    key={cls.id} 
                    className="flex flex-col md:flex-row md:items-center p-6 hover:bg-[#f8f9fa] transition-colors group cursor-pointer text-sm"
                    onClick={() => handleSelect(cls)}
                  >
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      {/* Name & Role */}
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-black text-slate-800 tracking-tight min-w-[3rem]">{cls.name}</span>
                        <div className="flex flex-col gap-1">
                          {cls.userRoleInClass && (
                            <span className={cn(
                              "text-[9px] font-black uppercase px-2 py-0.5 rounded-sm border inline-block w-fit",
                              cls.userRoleInClass === 'HOMEROOM' ? "text-green-600 bg-green-50 border-green-200" :
                              cls.userRoleInClass === 'DEPUTY' ? "text-orange-600 bg-orange-50 border-orange-200" :
                              cls.userRoleInClass === 'ADMIN' ? "text-blue-600 bg-blue-50 border-blue-200" :
                              "text-slate-500 bg-slate-50 border-slate-200"
                            )}>
                              {cls.userRoleInClass === 'HOMEROOM' ? 'Razrednik' : 
                               cls.userRoleInClass === 'DEPUTY' ? 'Zamjenik' : 
                               cls.userRoleInClass === 'ADMIN' ? 'Admin' : 
                               cls.userRoleInClass === 'STUDENT' ? 'Učenik' : 'Nastavnik'}
                            </span>
                          )}
                          {selectedYear?.status === 'ARCHIVED' && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-200 inline-block w-fit">Arhiva</span>
                          )}
                        </div>
                      </div>

                      {/* Homeroom Teacher */}
                      <div className="flex items-center gap-2 text-slate-600 font-bold uppercase text-[11px] tracking-tight border-l-0 md:border-l border-slate-200 md:pl-6 h-full">
                        <span className="text-slate-300 font-black block md:hidden">RAZREDNIK:</span>
                        {cls.homeroomTeacherName}
                      </div>

                      {/* Description / Program */}
                      <div className="text-slate-500 font-medium border-l-0 md:border-l border-slate-200 md:pl-6 h-full flex items-center">
                         <span className="text-slate-300 font-black block md:hidden mr-2">TIP:</span>
                        {cls.programName || `${cls.gradeLevel}. razred srednje škole`}
                      </div>
                    </div>
                    
                    <div className="mt-6 md:mt-0 md:ml-6">
                      <button
                        className="inline-flex items-center justify-center gap-2 py-2.5 px-8 rounded-sm text-xs font-black uppercase tracking-widest transition-all bg-[#005c8d] text-white hover:bg-[#004a70] shadow-sm active:scale-95 w-full md:w-auto"
                      >
                        Pristupi
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
