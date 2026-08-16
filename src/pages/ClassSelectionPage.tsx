import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { Role, SchoolYear, isSuperAdminUser, hasAnyRole } from '../types';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, Calendar, Plus, Award, FileText, UserX, Clock, Building2, Shield, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatPersonName, getProgramDisplayName } from '../lib/utils';
import { Header } from '../components/Header';

interface ClassWithDetails {
  id: string;
  name: string;
  gradeLevel: number;
  section: string;
  schoolId: string;
  yearId: string;
  yearName: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  homeroomTeacherId?: string;
  deputyTeacherId?: string;
  homeroomTeacherName?: string;
  deputyTeacherName?: string;
  userRoleInClass?: 'HOMEROOM' | 'DEPUTY' | 'TEACHER' | 'ADMIN' | 'STUDENT';
  programName?: string;
  program?: any;
}

interface SchoolOption {
  id: string;
  name: string;
  type?: string;
  roles: Role[];
}

export default function ClassSelectionPage() {
  const { user, isParent, isStaff, userSchoolRoles } = useAuth();
  const { setSelectedClassId, setIsArchived, setSelectedSchoolId, selectedSchoolId, selectedChildId, setSelectedYearId: setContextSelectedYearId } = useSelection();
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>(() => sessionStorage.getItem('selectedYearId') || '');
  const [summaries, setSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableSchools, setAvailableSchools] = useState<SchoolOption[]>([]);
  const [schoolMenuOpen, setSchoolMenuOpen] = useState(false);
  const [switchingSchool, setSwitchingSchool] = useState(false);
  const navigate = useNavigate();
  const lastClassesFetchKey = React.useRef("");

  // Sync state with sessionStorage
  useEffect(() => {
    if (selectedSchoolId) sessionStorage.setItem('selectedSchoolId', selectedSchoolId);
    if (selectedYearId) {
      sessionStorage.setItem('selectedYearId', selectedYearId);
      setContextSelectedYearId(selectedYearId);
    }
  }, [selectedSchoolId, selectedYearId, setContextSelectedYearId]);

  useEffect(() => {
    const cachedSchoolId = sessionStorage.getItem('selectedSchoolId');
    if (cachedSchoolId && !selectedSchoolId) {
        setSelectedSchoolId(cachedSchoolId);
    }
  }, []);

  const activeSchoolRoles = React.useMemo(() => {
    const roles = userSchoolRoles.filter((role: any) => {
      const roleSchoolId = role.schoolId || role.school_id;
      const status = String(role.status || 'ACTIVE').toUpperCase();
      return roleSchoolId === selectedSchoolId && status === 'ACTIVE';
    });
    console.log("MULTI SCHOOL - roles for active school", roles);
    return roles;
  }, [userSchoolRoles, selectedSchoolId]);

  const userRoleText = String((user as any)?.role || (user as any)?.globalRole || '').toUpperCase();
  const isProfileGlobalAdmin = ['SUPER_ADMIN', 'MAIN_ADMIN', 'ADMIN'].includes(userRoleText);
  const hasAdminRoleInAnySchool = React.useMemo(() => {
    return userSchoolRoles.some((role: any) => {
      const status = String(role.status || 'ACTIVE').toUpperCase();
      const roleName = String(role.role || '').toUpperCase();
      return status === 'ACTIVE' && ['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'MAIN_ADMIN'].includes(roleName);
    });
  }, [userSchoolRoles]);
  const isSuperAdmin = isSuperAdminUser(user, activeSchoolRoles);
  const isSchoolAdmin = isSuperAdmin || isProfileGlobalAdmin || hasAdminRoleInAnySchool || hasAnyRole(activeSchoolRoles, [Role.ADMIN, Role.SCHOOL_ADMIN, Role.SUPER_ADMIN, Role.MAIN_ADMIN]);

  const schoolsCount = React.useMemo(() => {
    return availableSchools.length;
  }, [availableSchools]);

  const selectedSchool = React.useMemo(
    () => availableSchools.find(school => school.id === selectedSchoolId) || null,
    [availableSchools, selectedSchoolId]
  );
  const isLoadingSchoolName = (name: string) =>
    String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('ucitavanje');
  const selectedSchoolLabel = React.useMemo(() => {
    const name = selectedSchool?.name || '';
    if (!name || isLoadingSchoolName(name)) {
      return 'Promijeni školu';
    }
    return name;
  }, [selectedSchool]);

  useEffect(() => {
    const loadAvailableSchools = async () => {
      if (!user?.id) return;
      try {
        console.log("MULTI SCHOOL - profile", user);

        const { data: schoolRoles, error } = await supabase
          .from("user_school_roles")
          .select(`
            id,
            school_id,
            role,
            status,
            schools:school_id (
              id,
              name,
              type,
              school_type
            )
          `)
          .eq("user_id", user.id)
          .eq("status", "ACTIVE");

        if (error) {
          console.warn("MULTI SCHOOL - schoolRoles query failed, continuing with schools fallback", error);
        }
        console.log("MULTI SCHOOL - schoolRoles", schoolRoles);

        const grouped = new Map<string, SchoolOption>();
        const seedSchoolIds = new Set<string>();
        userSchoolRoles
          .filter((role: any) => String(role.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
          .forEach((role: any) => {
            const schoolId = role.schoolId || role.school_id;
            if (!schoolId) return;
            seedSchoolIds.add(schoolId);
            const existing = grouped.get(schoolId) || {
              id: schoolId,
              name: 'Učitavanje ustanove...',
              type: '',
              roles: []
            };
            if (role.role && !existing.roles.includes(role.role)) {
              existing.roles.push(role.role);
            }
            grouped.set(schoolId, existing);
          });

        if (seedSchoolIds.size > 0) {
          const roleSchools = await Promise.all(
            Array.from(seedSchoolIds).map(async schoolId => {
              const { data, error: roleSchoolError } = await supabase
                .from("schools")
                .select("id, name, type, school_type")
                .eq("id", schoolId)
                .maybeSingle();

              if (roleSchoolError) {
                console.warn("MULTI SCHOOL - role school load failed", schoolId, roleSchoolError);
              }
              return data;
            })
          );

          roleSchools.filter(Boolean).forEach((school: any) => {
            const existing = grouped.get(school.id);
            if (!existing) return;
            grouped.set(school.id, {
              ...existing,
              name: school.name || existing.name,
              type: school.type || school.school_type || existing.type
            });
          });
        }

        (schoolRoles || []).forEach((item: any) => {
          const school = Array.isArray(item.schools) ? item.schools[0] : item.schools;
          const schoolId = item.school_id || school?.id;
          if (!schoolId) return;

          const existing = grouped.get(schoolId) || {
            id: schoolId,
            name: school?.name || 'Nepoznata ustanova',
            type: school?.type || school?.school_type,
            roles: []
          };
          if (school) {
            existing.name = school.name || existing.name;
            existing.type = school.type || school.school_type || existing.type;
          }
          if (item.role && !existing.roles.includes(item.role)) {
            existing.roles.push(item.role);
          }
          grouped.set(schoolId, existing);
        });

        if (isProfileGlobalAdmin || isSchoolAdmin) {
          const { data: allSchools, error: schoolsError } = await supabase
            .from("schools")
            .select("id, name, type, school_type")
            .order("name", { ascending: true });

          if (schoolsError) {
            console.warn("MULTI SCHOOL - all schools load failed", schoolsError);
          }

          (allSchools || []).forEach((school: any) => {
            if (!school?.id) return;
            const existing = grouped.get(school.id);
            grouped.set(school.id, {
              id: school.id,
              name: school.name || 'Nepoznata ustanova',
              type: school.type || school.school_type,
              roles: existing?.roles?.length ? existing.roles : (isProfileGlobalAdmin ? [Role.ADMIN] : ['DOSTUPNO'])
            });
          });
        }

        if (selectedSchoolId && !grouped.has(selectedSchoolId)) {
          const { data: currentSchool, error: currentSchoolError } = await supabase
            .from("schools")
            .select("id, name, type, school_type")
            .eq("id", selectedSchoolId)
            .maybeSingle();

          if (currentSchoolError) {
            console.warn("MULTI SCHOOL - selected school load failed", currentSchoolError);
          }

          if (currentSchool?.id) {
            grouped.set(currentSchool.id, {
              id: currentSchool.id,
              name: currentSchool.name || 'Nepoznata ustanova',
              type: currentSchool.type || currentSchool.school_type,
              roles: activeSchoolRoles.map((role: any) => role.role).filter(Boolean)
            });
          }
        }

        const schools = Array.from(grouped.values()).sort((a, b) =>
          a.name.localeCompare(b.name, 'hr')
        );
        setAvailableSchools(schools);

        const activeSchoolId = selectedSchoolId || (user as any)?.active_school_id || schools[0]?.id || null;
        console.log("MULTI SCHOOL - activeSchoolId", activeSchoolId);
        if (!selectedSchoolId && activeSchoolId) {
          setSelectedSchoolId(activeSchoolId);
        }
      } catch (error) {
        console.error("MULTI SCHOOL - load schools error", error);
      }
    };

    loadAvailableSchools();
  }, [user?.id, selectedSchoolId, setSelectedSchoolId, isProfileGlobalAdmin, isSchoolAdmin, userSchoolRoles, activeSchoolRoles]);

  useEffect(() => {
    const init = async () => {
      let schoolId = selectedSchoolId;

      // 1. Resolve school ID if needed
      if (!schoolId && user) {
        schoolId = (user as any).active_school_id ||
                   (user as any).school_id ||
                   (userSchoolRoles && userSchoolRoles.length > 0 ? userSchoolRoles[0].schoolId : null) ||
                   (user as any).profile?.school_id;
        
        if (schoolId) {
          setSelectedSchoolId(schoolId);
          return; // Trigger re-render
        } else {
          setLoading(false);
          toast.error("Nije pronađena škola za korisnika.");
          return;
        }
      }

      if (!schoolId) return;

      const fetchKey = `${schoolId}`;
      if (lastClassesFetchKey.current === fetchKey && classes.length > 0) {
        return;
      }
      
      setLoading(true);
      await fetchSchoolYears();
      if (isStaff) {
        await fetchStaffClasses();
      } else {
        const enrollments = await fetchEnrollments();
        // Filter school years based on enrollments
        const yearIds = new Set(enrollments.map((e: any) => e.classes?.school_year_id));
        setSchoolYears(prev => prev.filter(y => yearIds.has(y.id)));
      }
      
      lastClassesFetchKey.current = fetchKey;
      setLoading(false);
    };
    init();
  }, [user, selectedSchoolId, selectedChildId, isStaff, isSchoolAdmin]);

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
        console.log("CLASS SELECT schoolYears result", data);
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
          console.log("CLASS SELECT selectedYear", activeYear);
          setSelectedYearId(activeYear.id);
        } else if (years.length > 0) {
          console.log("CLASS SELECT selectedYear", years[0]);
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
          program:program_id(*),
          homeroom:homeroom_teacher_id(*),
          deputy:deputy_teacher_id(*)
        `)
        .eq('school_id', selectedSchoolId);

      if (classError) {
        throw classError;
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
          const programDisplay = getProgramDisplayName(cls.program, { short: true });
          console.log("CLASS PROGRAM RAW", cls.program);
          console.log("CLASS PROGRAM DISPLAY", programDisplay);
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
            deputyTeacherId: cls.deputy_teacher_id,
            homeroomTeacherName: (cls.homeroom as any)?.name,
            deputyTeacherName: (cls.deputy as any)?.name,
            userRoleInClass: role as any,
            program: cls.program,
            programName: programDisplay || `${cls.grade_level}. razred`
          } as any;
        });

      const sortedClassesData = (classesData || []).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'hr'));
      setClasses(sortedClassesData);
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju razreda');
    }
  };

  const fetchEnrollments = async () => {
    if (!user) return [];

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
            deputy_teacher_id,
            program:program_id(*),
            homeroom:user_profiles!classes_homeroom_teacher_id_fkey(name),
            deputy:user_profiles!classes_deputy_teacher_id_fkey(name)
          )
        `)
        .eq('student_id', studentId);

      if (error) {
        console.error("ENROLLMENT QUERY ERROR:", error);
        throw error;
      }

      // Fetch year summaries for the active student
      const { data: summariesData, error: summariesError } = await supabase
        .from('student_year_summaries')
        .select('*')
        .eq('student_id', studentId);
      
      if (summariesError) {
        console.error("SUMMARIES QUERY ERROR:", summariesError);
      } else {
        setSummaries(summariesData || []);
      }

      // Group by class_id to get only unique classes student is enrolled in
      const classesData: ClassWithDetails[] = [];
      const seenClasses = new Set<string>();

      (enrollments || []).forEach((env: any) => {
        if (!seenClasses.has(env.class_id) && (!selectedSchoolId || env.classes?.school_id === selectedSchoolId)) {
          const programDisplay = getProgramDisplayName(env.classes.program, { short: true });
          console.log("CLASS PROGRAM RAW", env.classes.program);
          console.log("CLASS PROGRAM DISPLAY", programDisplay);
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
            deputyTeacherId: env.classes.deputy_teacher_id,
            homeroomTeacherName: env.classes.homeroom?.name,
            deputyTeacherName: env.classes.deputy?.name,
            userRoleInClass: 'STUDENT',
            program: env.classes.program,
            programName: programDisplay || `${env.classes.grade_level}. razred`
          } as any);
        }
      });

      const sortedClassesData = (classesData || []).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'hr'));
      setClasses(sortedClassesData);
      return enrollments || [];
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju razreda');
      return [];
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

  const handleSwitchSchool = async (school: SchoolOption) => {
    if (!school?.id || school.id === selectedSchoolId) {
      setSchoolMenuOpen(false);
      return;
    }

    try {
      setSwitchingSchool(true);
      console.log("MULTI SCHOOL - selected school", school);

      localStorage.removeItem("selectedClassId");
      sessionStorage.removeItem("selectedClassId");
      localStorage.removeItem("selectedClass");
      sessionStorage.removeItem("selectedClass");
      localStorage.removeItem("selectedSchoolYearId");
      sessionStorage.removeItem("selectedSchoolYearId");
      localStorage.removeItem("selectedYearId");
      sessionStorage.removeItem("selectedYearId");

      setSelectedClassId(null);
      setIsArchived(false);
      setSelectedYearId('');
      setContextSelectedYearId(null);
      setClasses([]);
      setSchoolYears([]);
      lastClassesFetchKey.current = "";

      if (user?.id) {
        const { error } = await supabase
          .from("user_profiles")
          .update({ active_school_id: school.id })
          .eq("id", user.id);

        if (error) {
          console.warn("MULTI SCHOOL - active_school_id update failed", error);
        }
      }

      setSelectedSchoolId(school.id);
      sessionStorage.setItem("selectedSchoolId", school.id);
      setSchoolMenuOpen(false);
      navigate('/select-class');
    } catch (error) {
      console.error("MULTI SCHOOL - switch failed", error);
      toast.error("Promjena škole nije uspjela.");
    } finally {
      setSwitchingSchool(false);
    }
  };

  const handleCreateClass = () => {
    if (!isSchoolAdmin || !selectedSchoolId) {
      return;
    }
    if (schoolYears.length === 0) {
      navigate('/admin-skole/skolske-godine');
      return;
    }
    if (!selectedYear) {
      navigate(`/admin-skole?openAddClass=true&schoolYearId=${schoolYears[0].id}`);
      return;
    }
    console.log('ADD CLASS CLICKED');
    navigate(`/admin-skole?openAddClass=true&schoolYearId=${selectedYear.id}`);
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

  const handleSelectMenu = (cls: ClassWithDetails, path: string) => {
    setSelectedClassId(cls.id);
    setSelectedSchoolId(cls.schoolId);
    setIsArchived(cls.status !== 'ACTIVE' || selectedYear?.status === 'ARCHIVED');
    navigate(`/student/${path}`);
  };

  const getShortenedYear = (yearName: string) => {
    if (!yearName) return '';
    const parts = yearName.split('/');
    if (parts.length === 2) {
      const p1 = parts[0].trim().slice(-2);
      const p2 = parts[1].trim().slice(-2);
      return `${p1}/${p2}`;
    }
    return yearName;
  };

  const menuItems = [
    { label: 'Ocjene', path: 'ocjene', icon: Award, color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100/70' },
    { label: 'Bilješke', path: 'biljeske', icon: FileText, color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100/70' },
    { label: 'Ispiti', path: 'ispiti', icon: Calendar, color: 'text-purple-600 bg-purple-50 border-purple-200 hover:bg-purple-100/70' },
    { label: 'Izostanci', path: 'izostanci', icon: UserX, color: 'text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100/70' },
    { label: 'Raspored', path: 'raspored', icon: Clock, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#005c8d] mb-4" />
        <p className="text-slate-500 font-medium">Učitavanje popisa razreda...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans flex flex-col">
      <Header showNav={false} />
      <div className="flex-1 max-w-5xl mx-auto py-12 px-6 w-full">
        <div className="flex justify-between items-center mb-8 gap-3">
          {schoolsCount > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSchoolMenuOpen(open => !open)}
                disabled={switchingSchool}
                className="text-[10px] font-black uppercase text-slate-700 hover:text-[#005c8d] transition-colors flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-sm shadow-xs disabled:opacity-60 min-w-[220px]"
              >
                <Building2 size={14} />
                <span className="max-w-[280px] truncate text-left">
                  {selectedSchoolLabel}
                </span>
                <ChevronDown size={14} />
              </button>

              {schoolMenuOpen && (
                <div className="absolute left-0 top-full mt-2 w-[360px] max-w-[calc(100vw-3rem)] bg-white border border-slate-200 rounded-sm shadow-xl z-30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Promijeni školu
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {availableSchools.map(school => {
                      const active = school.id === selectedSchoolId;
                      return (
                        <button
                          key={school.id}
                          type="button"
                          onClick={() => handleSwitchSchool(school)}
                          className={cn(
                            "w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors",
                            active && "bg-sky-50"
                          )}
                        >
                          <div className="text-xs font-black text-slate-900 uppercase tracking-tight">
                            {isLoadingSchoolName(school.name) ? 'Ustanova' : school.name}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                            {school.roles.join(', ')}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-sm shadow-xs min-w-[220px]">
              <Building2 size={14} />
              <span className="max-w-[280px] truncate">{selectedSchool?.name || 'Ucitavanje skola...'}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button 
                onClick={() => navigate('/admin/schools')}
                className="text-[10px] font-black uppercase text-white bg-slate-800 hover:bg-slate-900 transition-colors flex items-center gap-2 px-5 py-2 rounded-sm shadow-sm"
              >
                <Shield size={14} />
                Administracija sustava
                <ArrowRight size={14} />
              </button>
            )}
            {isSchoolAdmin && (
              <button 
                onClick={() => navigate('/admin-skole')}
                className="text-[10px] font-black uppercase text-white bg-[#005c8d] hover:bg-[#004a70] transition-colors flex items-center gap-2 px-6 py-2 rounded-sm shadow-sm"
              >
                <Building2 size={14} />
                Administracija škole
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tight mb-2">Odabir razreda</h1>
          <div className="w-12 h-1 bg-[#005c8d] mx-auto opacity-20"></div>
          {isStaff && (
            <p className="text-[10px] text-slate-500 uppercase font-bold mt-4 tracking-widest">
              Zaposlenik: {formatPersonName(user)}
            </p>
          )}
        </div>

        {schoolYears.length === 0 ? (
          <div className="bg-white border border-[#dee2e6] rounded-sm shadow-sm p-8 md:p-12 text-center max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar size={32} />
            </div>
            <h2 className="text-base font-black text-slate-800 uppercase tracking-tight mb-2">
              Nema pronađenih školskih godina
            </h2>
            <p className="text-slate-500 text-xs mb-6">
              Za ovu ustanovu još nije definirana školska godina ili nema unesenih podataka.
            </p>
            {isSchoolAdmin ? (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-sky-50 border border-sky-100 p-4 rounded text-xs font-bold text-[#005c8d] max-w-lg">
                  Kao administrator ustanove možete otvoriti administraciju kako biste kreirali školske godine, razrede, smjerove i dodijelili korisnike.
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                  <button
                    onClick={() => navigate('/admin-skole')}
                    className="inline-flex items-center gap-2 bg-[#005c8d] text-white px-6 py-2.5 rounded-sm font-black uppercase text-[10px] tracking-widest hover:bg-[#004a70] transition-all shadow-md active:scale-95"
                  >
                    <Building2 size={14} />
                    Administracija škole
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => navigate('/admin-skole/skolske-godine')}
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-sm font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                  >
                    <Plus size={14} />
                    Dodaj školsku godinu
                  </button>
                  {isSuperAdmin && (
                    <button
                      onClick={() => navigate('/admin/schools')}
                      className="inline-flex items-center gap-2 bg-slate-800 text-white px-6 py-2.5 rounded-sm font-black uppercase text-[10px] tracking-widest hover:bg-slate-900 transition-all shadow-md active:scale-95"
                    >
                      <Shield size={14} />
                      Administracija sustava
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-slate-400 italic text-xs">
                Nemate dodijeljenih razreda. Obratite se administratoru škole.
              </p>
            )}
          </div>
        ) : (
          <>
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

        {!isStaff ? (
          /* Student Card Grid Layout */
          filteredClasses.length === 0 ? (
            <div className="bg-white border border-[#dee2e6] rounded-sm shadow-sm overflow-hidden px-6 py-16 text-center">
              <div className="w-16 h-16 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar size={32} />
              </div>
              <p className="text-slate-400 italic">Nema pronađenih razreda za odabranu školsku godinu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mt-2">
              {filteredClasses
                .sort((a, b) => (String(a.name || "")).localeCompare(b.name))
                .map((cls) => {
                  const summary = summaries.find(s => 
                    s.class_id === cls.id && 
                    (s.school_year_id === selectedYearId || (!s.school_year_id && s.school_year === cls.yearName))
                  );
                  const isFinalized = summary && summary.status === 'FINALIZED';
                  const overall_average = isFinalized ? (summary.average ?? summary.overallAverage) : null;

                  const formattedAverage = typeof overall_average === 'number' 
                    ? overall_average.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                    : null;

                  return (
                    <div key={cls.id} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between">
                      {/* Upper Header Section */}
                      <div 
                        className="cursor-pointer group select-none"
                        onClick={() => handleSelect(cls)}
                      >
                        <div className="flex flex-col mb-4">
                          <div className="text-2xl font-black text-[#005c8d] uppercase tracking-tight group-hover:text-[#004a70] transition-colors mb-2">
                            {cls.name}
                          </div>
                          
                          <div className="text-[10px] text-slate-600 font-bold uppercase">
                             Razrednik: {cls.homeroomTeacherName || 'NIJE DODIJELJEN'}
                          </div>
                          {cls.deputyTeacherName && (
                              <div className="text-[10px] text-slate-600 font-bold uppercase">
                                Zamjenik: {cls.deputyTeacherName}
                              </div>
                          )}

                          <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mt-3">
                              Program:
                          </div>
                          <div className="text-slate-600 font-bold uppercase text-[11px]">
                              {cls.programName || `${cls.gradeLevel}. razred`}
                          </div>
                        </div>
                      </div>

                      {/* Navigation Menu/Tiles */}
                      <div className="grid grid-cols-5 gap-1.5 my-5">
                        {menuItems.map(item => {
                          const ItemIcon = item.icon;
                          return (
                            <button
                              key={item.label}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectMenu(cls, item.path);
                              }}
                              className={cn(
                                "flex flex-col items-center justify-center p-2 rounded border border-slate-100 transition-all text-center cursor-pointer",
                                item.color
                              )}
                              title={item.label}
                            >
                              <ItemIcon size={18} className="mb-1 shrink-0" />
                              <span className="text-[9px] font-black uppercase tracking-tight leading-none block whitespace-nowrap">
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Footer Section - General Success */}
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-black uppercase tracking-wide">
                        {isFinalized && typeof overall_average === 'number' ? (
                          <>
                            <span className="text-slate-500">Opći uspjeh</span>
                            <span className="text-[#10b981] font-black text-sm bg-emerald-50 border border-emerald-200 px-3 py-1 rounded">
                              {formattedAverage}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-400">Opći uspjeh</span>
                            <span className="text-slate-400 font-black text-sm bg-slate-50 border border-slate-200 px-3 py-1 rounded">
                              *
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )
        ) : (
          /* Staff Standard Row Style */
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
                <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar size={32} />
                </div>
                <p className="text-slate-600 font-bold text-sm mb-2">Nema pronađenih razreda za odabranu školsku godinu.</p>
                {isSchoolAdmin ? (
                  <div className="flex flex-col items-center gap-4 mt-4">
                    <p className="text-slate-500 text-xs max-w-md mx-auto">
                      Možete otvoriti administraciju škole za upravljanje podacima ili dodati novi razred u ovu školsku godinu.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button 
                        onClick={() => navigate('/admin-skole')}
                        className="inline-flex items-center gap-2 bg-[#005c8d] text-white px-6 py-2.5 rounded-sm font-black uppercase text-[10px] tracking-widest hover:bg-[#004a70] transition-all shadow-md active:scale-95"
                      >
                        <Building2 size={14} />
                        Administracija škole
                        <ArrowRight size={14} />
                      </button>
                      {isSuperAdmin && (
                        <button 
                          onClick={() => navigate('/admin/schools')}
                          className="inline-flex items-center gap-2 bg-slate-800 text-white px-6 py-2.5 rounded-sm font-black uppercase text-[10px] tracking-widest hover:bg-slate-900 transition-all shadow-md active:scale-95"
                        >
                          <Shield size={14} />
                          Administracija sustava
                          <ArrowRight size={14} />
                        </button>
                      )}
                      <button 
                        onClick={handleCreateClass}
                        className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-sm font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                      >
                        <Plus size={16} />
                        Dodaj razred u ovu školsku godinu
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs italic mt-2">Nemate dodijeljenih razreda za odabranu školsku godinu. Obratite se administratoru škole.</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#dee2e6]">
                {filteredClasses
                  .sort((a, b) => (String(a.name || "")).localeCompare(b.name))
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

                        {/* Homeroom / Deputy Teacher */}
                        <div className="flex flex-col gap-0.5 text-slate-600 font-bold uppercase text-[11px] tracking-tight border-l-0 md:border-l border-slate-200 md:pl-6 h-full justify-center">
                          <span className="text-slate-300 font-black block md:hidden">NASTAVNICI:</span>
                          <div className="truncate">
                            {(() => {
                              const teachers = [];
                              if (cls.homeroomTeacherName) teachers.push(cls.homeroomTeacherName);
                              if (cls.deputyTeacherName) teachers.push(cls.deputyTeacherName);
                              return teachers.length > 0 ? teachers.join(', ') : 'NIJE DODIJELJEN';
                            })()}
                          </div>
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
        )}
          </>
        )}
      </div>
    </div>
  );
}
