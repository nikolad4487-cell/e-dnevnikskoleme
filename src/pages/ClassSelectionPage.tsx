import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { Class, Role } from '../types';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface ClassWithDetails {
  id: string;
  name: string;
  gradeLevel: number;
  section: string;
  schoolId: string;
  yearName: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  homeroomTeacherName?: string;
  userRoleInClass?: 'HOMEROOM' | 'DEPUTY' | 'TEACHER' | 'ADMIN' | 'STUDENT';
}

export default function ClassSelectionPage() {
  const { user, isParent, isStaff, isMainAdmin, userSchoolRoles } = useAuth();
  const { setSelectedClassId, setIsArchived, setSelectedSchoolId, selectedSchoolId, selectedChildId } = useSelection();
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Current roles in selected school
  const currentSchoolRoles = userSchoolRoles.filter(r => r.schoolId === selectedSchoolId).map(r => r.role);
  const isSchoolAdmin = isMainAdmin || currentSchoolRoles.includes(Role.SCHOOL_ADMIN) || currentSchoolRoles.includes(Role.ADMIN);

  useEffect(() => {
    if (isStaff) {
      fetchStaffClasses();
    } else {
      fetchEnrollments();
    }
  }, [user, selectedSchoolId, selectedChildId, isStaff]);

  const fetchStaffClasses = async () => {
    if (!user || !selectedSchoolId) return;
    setLoading(true);

    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        toast.error('Učitavanje razreda traje predugo.');
      }
    }, 10000);

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

      if (classError) throw classError;

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
            yearName: cls.school_year,
            status: cls.status,
            homeroomTeacherId: cls.homeroom_teacher_id,
            homeroomTeacherName: (cls.homeroom as any)?.name || 'Nije dodijeljen',
            userRoleInClass: role as any
          } as any;
        });

      setClasses(classesData);
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju razreda');
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const fetchEnrollments = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let studentId = user.id;
      
      if (isParent && selectedChildId) {
        studentId = selectedChildId;
      }

      const { data: enrollments, error } = await supabase
        .from('student_subject_enrollments')
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
            school_year,
            homeroom_teacher_id,
            homeroom:user_profiles!classes_homeroom_teacher_id_fkey(name),
            deputy:user_profiles!classes_deputy_teacher_id_fkey(name)
          )
        `)
        .eq('student_id', studentId);

      if (error) throw error;

      // Group by class_id to get only unique classes student is enrolled in
      const classesData: ClassWithDetails[] = [];
      const seenClasses = new Set<string>();

      (enrollments || []).forEach((env: any) => {
        if (!seenClasses.has(env.class_id)) {
          seenClasses.add(env.class_id);
          classesData.push({
            id: env.classes.id,
            name: env.classes.name,
            gradeLevel: env.classes.grade_level,
            section: env.classes.section,
            schoolId: env.classes.school_id,
            yearName: env.classes.school_year,
            status: env.status,
            homeroomTeacherId: env.classes.homeroom_teacher_id,
            homeroomTeacherName: env.classes.homeroom?.name || 'Nije dodijeljen',
            userRoleInClass: 'STUDENT'
          } as any);
        }
      });

      // Sort: ACTIVE first, then by yearName descending
      classesData.sort((a, b) => {
        if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
        if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1;
        return b.yearName.localeCompare(a.yearName);
      });

      setClasses(classesData);
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju razreda');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (cls: ClassWithDetails) => {
    setSelectedClassId(cls.id);
    setSelectedSchoolId(cls.schoolId);
    setIsArchived(cls.status !== 'ACTIVE');
    
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

  const getRowColorClass = (role?: string) => {
    if (role === 'HOMEROOM') return 'bg-green-50 hover:bg-green-100 transition-colors border-l-4 border-l-green-600';
    if (role === 'DEPUTY') return 'bg-orange-50 hover:bg-orange-100 transition-colors border-l-4 border-l-orange-500';
    return 'bg-white hover:bg-[#f8f9fa] transition-colors group border-l-4 border-l-transparent';
  };

  const getRoleLabel = (cls: ClassWithDetails) => {
    if (cls.userRoleInClass === 'HOMEROOM') return <span className="text-[9px] font-black uppercase text-green-600 bg-green-50 px-1 border border-green-200">Razrednik</span>;
    if (cls.userRoleInClass === 'DEPUTY') return <span className="text-[9px] font-black uppercase text-orange-600 bg-orange-50 px-1 border border-orange-200">Zamjenik</span>;
    if (cls.userRoleInClass === 'TEACHER') return <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-50 px-1 border border-slate-200">Nastavnik</span>;
    if (cls.userRoleInClass === 'ADMIN') return <span className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1 border border-blue-200">Admin</span>;
    return null;
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <div className="max-w-5xl mx-auto py-12 px-6">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tight mb-2">Odabir razreda</h1>
          <div className="w-12 h-1 bg-[#005c8d] mx-auto opacity-20"></div>
          {isStaff && (
            <p className="text-[10px] text-slate-500 uppercase font-bold mt-4 tracking-widest">
              Zaposlenik: {user?.name} {user?.surname}
            </p>
          )}
        </div>

        <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f1f3f5] border-b border-[#dee2e6]">
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Razred</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Uloga</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Školska godina</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Razrednik</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600 text-right">Akcija</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dee2e6]">
              {classes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                    Nema pronađenih razreda za odabrane kriterije.
                  </td>
                </tr>
              ) : (
                classes.map((cls, idx) => (
                  <tr key={`${cls.id}-${idx}`} className={getRowColorClass(cls.userRoleInClass)}>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-sm whitespace-nowrap">{cls.name}</span>
                        {cls.status === 'ARCHIVED' && (
                          <span className="text-[8px] font-black uppercase text-amber-600 tracking-tighter">Arhiviran</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {getRoleLabel(cls)}
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm text-slate-600 font-medium">{cls.yearName}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm text-slate-700 font-bold">{cls.homeroomTeacherName}</div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button
                        onClick={() => handleSelect(cls)}
                        className="inline-flex items-center gap-1 py-2 px-6 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all bg-[#005c8d] text-white hover:bg-[#004a70]"
                      >
                        Pristupi
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
