import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { School, Role } from '../types';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

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
        schoolIds = userSchoolRoles.map(r => r.school_id);
      }

      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('name');

      if (error) throw error;
      
      let filteredSchools = (data || []).map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        subtype: d.subtype,
        address: d.address,
        city: d.city,
        status: d.status || 'ACTIVE'
      } as any));

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
      navigate('/admin/school-dashboard');
    } else if (isOnlyStudentOrParent) {
      navigate('/select-class');
    } else {
      navigate('/teacher/imenik');
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
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <div className="max-w-5xl mx-auto py-12 px-6">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tight mb-2">Odabir škole</h1>
          <div className="w-12 h-1 bg-[#005c8d] mx-auto opacity-20"></div>
        </div>

        <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden shadow-sm">
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

        {isMainAdmin && (
          <div className="mt-8 flex justify-center">
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
               Prijavljeni ste kao administrator sustava i vidite sve škole.
             </p>
          </div>
        )}
      </div>
    </div>
  );
}
