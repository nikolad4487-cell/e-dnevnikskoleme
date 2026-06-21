import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { School, Role } from '../types';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Header } from '../components/Header';
import { parseSchoolAddress } from './admin/SchoolsManagementPage';

export default function SchoolSelectionPage() {
  const { user, isMainAdmin, userSchoolRoles, isParent, isStaff } = useAuth();
  const { setSelectedSchoolId, selectedChildId } = useSelection();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSchools();
  }, [user, userSchoolRoles, selectedChildId]);

  const fetchSchools = async () => {
    if (!user) return;
    setLoading(true);
    
    // Safety timeout
    const timeout = setTimeout(() => {
      if (loading) {
        console.error('[SCHOOLS] Fetch took too long');
        setLoading(false);
        toast.error('Učitavanje traje predugo. Provjerite vezu.');
      }
    }, 10000);

    try {
      let schoolIds: string[] = [];
      
      if (isParent && selectedChildId) {
        // For parents, find child's schools through their roles
        const { data: childRoles } = await supabase
          .from('user_school_roles')
          .select('school_id, status')
          .eq('user_id', selectedChildId);
        
        schoolIds = (childRoles || []).map(r => r.school_id);
      } else {
        const directSchoolIds = userSchoolRoles.map(r => r.school_id);
        
        // Fallback for students: check class enrollments if user doesn't have roles
        // This handles cases where student has class enrollment but no school role yet
        let enrollmentSchoolIds: string[] = [];
        try {
          const { data: enrollments } = await supabase
            .from('student_class_enrollments')
            .select('classes(school_id)')
            .eq('student_id', user.id)
            .eq('status', 'ACTIVE');
          
          enrollmentSchoolIds = (enrollments || [])
            .map((e: any) => e.classes?.school_id)
            .filter(Boolean);
        } catch (e) {
          console.error('[SCHOOLS] Error fetching student enrollments:', e);
        }

        schoolIds = [...new Set([...directSchoolIds, ...enrollmentSchoolIds])];
      }

      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('name');

      if (error) throw error;
      
      let filteredSchools = (data || []).map(d => {
        const parsed = parseSchoolAddress(d.address);
        return {
          id: d.id,
          name: d.name,
          type: d.type,
          subtype: d.subtype,
          address: parsed.address,
          city: d.city,
          status: parsed.status || d.status || 'ACTIVE'
        } as any;
      });

      if (!isMainAdmin) {
        filteredSchools = filteredSchools.filter(s => schoolIds.includes(s.id));
      }

      setSchools(filteredSchools);

      // Auto-redirect if only one school and not a global admin
      // PH7: If user has one school: → auto enter that school
      if (filteredSchools.length === 1 && !isMainAdmin) {
        handleSelect(filteredSchools[0].id);
      }
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju škola');
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const handleSelect = (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    
    // Determine the most appropriate redirect based on roles
    const roleNames = userSchoolRoles.map(r => r.role);
    const isAnyAdmin = isMainAdmin || roleNames.includes(Role.ADMIN) || roleNames.includes(Role.SCHOOL_ADMIN);
    const isOnlyStudentOrParent = (isParent || roleNames.includes(Role.STUDENT)) && !isStaff;

    if (isAnyAdmin) {
      navigate('/admin-skole');
    } else {
      navigate('/select-class');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#005c8d] mb-4" />
        <p className="text-slate-500 font-medium">Učitavanje popisa škola...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans flex flex-col">
      <Header showNav={false} />
      <div className="flex-1 max-w-5xl mx-auto py-6 md:py-12 px-4 md:px-6 w-full">
        <div className="mb-6 md:mb-10 text-center">
          <h1 className="text-xl md:text-2xl font-black text-[#005c8d] uppercase tracking-tight mb-1.5 md:mb-2">Odabir škole</h1>
          <div className="w-12 h-1 bg-[#005c8d] mx-auto opacity-20"></div>
        </div>

        {/* Desktop view table */}
        <div className="hidden md:block bg-white border border-[#dee2e6] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f1f3f5] border-b border-[#dee2e6]">
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Naziv škole</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Vrsta</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Status</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600 text-right">Akcija</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dee2e6]">
              {schools.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                    Nema pronađenih škola za vaš korisnički račun.
                  </td>
                </tr>
              ) : (
                schools.map(school => (
                  <tr key={school.id} className="hover:bg-[#f8f9fa] transition-colors group">
                    <td className="px-6 py-5">
                      <div className="font-bold text-slate-800 text-sm">{school.name}</div>
                      <div className="text-[11px] text-slate-500 uppercase font-medium">{school.city || '—'}</div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-[10px] font-black uppercase tracking-tight py-1 px-2 bg-slate-100 rounded text-slate-600 border border-slate-200">
                        {school.type === 'PRIMARY' ? 'Osnovna' : 'Srednja'}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      {school.status === 'ARCHIVED' ? (
                        <span className="text-[10px] font-black uppercase tracking-tight py-1 px-2 bg-amber-50 text-amber-700 border border-amber-100 rounded">
                          Arhivirana
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-tight py-1 px-2 bg-green-50 text-green-700 border border-green-100 rounded">
                          Trenutna
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button
                        onClick={() => handleSelect(school.id)}
                        className="inline-flex items-center gap-1 bg-[#005c8d] text-white py-2 px-6 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-[#004a70] transition-all"
                      >
                        Otvori
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Layout cards */}
        <div className="block md:hidden space-y-4">
          {schools.length === 0 ? (
            <div className="p-8 text-center text-slate-400 italic bg-white border border-slate-200 rounded-xl">
              Nema pronađenih škola za vaš korisnički račun.
            </div>
          ) : (
            schools.map(school => (
              <div key={school.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                      <span className="text-lg">🏫</span> {school.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{school.city || '—'}</p>
                  </div>
                  <div>
                    {school.status === 'ARCHIVED' ? (
                      <span className="text-[9px] font-black uppercase tracking-tight py-1 px-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded">
                        Arhivirana
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-tight py-1 px-1.5 bg-green-50 text-green-700 border border-green-100 rounded">
                        Trenutna
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-2.5">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Vrsta škole</span>
                    <span className="font-semibold text-slate-700">
                      {school.type === 'PRIMARY' ? 'Osnovna škola' : 'Srednja škola'}
                    </span>
                  </div>
                  {school.subtype && (
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tip</span>
                      <span className="font-semibold text-slate-700">{school.subtype}</span>
                    </div>
                  )}
                </div>

                {school.address && (
                  <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block mb-0.5">Adresa</span>
                    <span className="font-medium">{school.address}</span>
                  </div>
                )}

                <button
                  onClick={() => handleSelect(school.id)}
                  className="w-full bg-[#005c8d] text-white py-3 px-4 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#004a70] transition-all flex items-center justify-center gap-1.5 select-none active:scale-98"
                >
                  Otvori školu
                  <ArrowRight size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {isMainAdmin && (
          <div className="mt-6 flex justify-center text-center">
             <p className="text-[9.5px] text-slate-400 font-black uppercase tracking-widest px-4">
               Prijavljeni ste kao administrator sustava i vidite sve škole.
             </p>
          </div>
        )}
      </div>
    </div>
  );
}
