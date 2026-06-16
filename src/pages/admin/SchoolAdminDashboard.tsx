import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { School, Role } from '../../types';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  BookOpen, 
  GraduationCap, 
  Calendar, 
  Settings, 
  ChevronRight, 
  Building2,
  FileText,
  BarChart3,
  UserPlus,
  MessageSquare,
  Archive
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function SchoolAdminDashboard() {
  const { selectedSchoolId } = useSelection();
  const navigate = useNavigate();
  const [school, setSchool] = useState<School | null>(null);
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedSchoolId) {
      navigate('/admin/schools');
      return;
    }
    fetchSchoolData();
  }, [selectedSchoolId]);

  const fetchSchoolData = async () => {
    try {
      setLoading(true);
      
      // Fetch School
      const { data: schoolData, error: schoolError } = await supabase
        .from('schools')
        .select('*')
        .eq('id', selectedSchoolId)
        .single();
      
      if (schoolError) throw schoolError;
      setSchool(schoolData);

      // Fetch Stats
      // Note: This is an efficient way to get multiple counts in Supabase
      const [studentsRes, teachersRes, classesRes, subjectsRes] = await Promise.all([
        supabase.from('user_school_roles').select('id', { count: 'exact', head: true }).eq('school_id', selectedSchoolId).eq('role', Role.STUDENT),
        supabase.from('user_school_roles').select('id', { count: 'exact', head: true }).eq('school_id', selectedSchoolId).in('role', [Role.TEACHER, Role.HOMEROOM, Role.DEPUTY]),
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', selectedSchoolId),
        supabase.from('subjects').select('id', { count: 'exact', head: true }) // Global subjects
      ]);

      setStats({
        students: studentsRes.count || 0,
        teachers: teachersRes.count || 0,
        classes: classesRes.count || 0,
        subjects: subjectsRes.count || 0
      });

    } catch (err: any) {
      toast.error('Greška pri učitavanju podataka škole');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const adminModules = [
    { id: 'skole', name: 'Škole', icon: Building2, color: 'bg-[#005c8d]', link: '/admin/schools' },
    { id: 'godine', name: 'Školske godine', icon: Calendar, color: 'bg-emerald-500', link: '/admin-skole/skolske-godine' },
    { id: 'kalendar-skole', name: 'Školski kalendar', icon: Calendar, color: 'bg-blue-600', link: '/admin-skole/kalendar' },
    { id: 'razredi', name: 'Razredni odjeli', icon: GraduationCap, color: 'bg-blue-500', link: '/admin-skole/razredi' },
    { id: 'korisnici', name: 'Korisnici / Nastavnici', icon: Users, color: 'bg-indigo-500', link: '/admin-skole/korisnici' },
    { id: 'ucenici', name: 'Učenici u školi', icon: Users, color: 'bg-teal-500', link: '/admin-skole/ucenici' },
    { id: 'predmeti', name: 'Globalni predmeti', icon: BookOpen, color: 'bg-amber-500', link: '/admin-skole/predmeti' },
    { id: 'smjerovi', name: 'Smjerovi / programi', icon: BookOpen, color: 'bg-orange-500', link: '/admin-skole/programi' },
    { id: 'ravnatelj-dashboard', name: 'Dashboard Ravnatelja', icon: BarChart3, color: 'bg-[#005c8d]', link: '/admin-skole/ravnatelj-dashboard' },
    { id: 'maticna-knjiga', name: 'Matična knjiga', icon: FileText, color: 'bg-teal-600', link: '/admin-skole/maticna-knjiga' },
    { id: 'arhiva', name: 'Arhiva', icon: Archive, color: 'bg-purple-600', link: '/admin-skole/arhiva' },
    { id: 'prijenos', name: 'Prijenos / rollover', icon: FileText, color: 'bg-red-500', link: '/admin-skole/rollover' },
    { id: 'informativka', name: 'Informativka', icon: MessageSquare, color: 'bg-emerald-500', link: '/admin-skole/informativka' },
    { id: 'system-check', name: 'Provjera Sustava', icon: BarChart3, color: 'bg-red-700', link: '/admin-skole/system-check' },
    { id: 'system-health', name: 'Zdravlje Sustava', icon: BarChart3, color: 'bg-indigo-600', link: '/admin-skole/system-health' },
    { id: 'postavke', name: 'Postavke škole', icon: Settings, color: 'bg-slate-700', link: '/admin-skole/postavke' },
  ];

  if (loading) return <div className="p-8 text-center animate-pulse font-black uppercase text-slate-300">Učitavanje...</div>;

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <div className="ed-header">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-[#005c8d]" />
          <span>Administracija škole: {school?.name}</span>
        </div>
        <button 
          onClick={() => navigate('/admin/schools')}
          className="text-[10px] uppercase font-bold text-[#005c8d] hover:underline"
        >
          Promijeni školu
        </button>
      </div>

      <div className="ed-content">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-1 mb-3 uppercase tracking-tight">Administrativni izbornik</h3>
            <ul className="space-y-1">
              {adminModules.map((module) => (
                <li key={module.id}>
                  <button
                    onClick={() => navigate(module.link)}
                    className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 border border-transparent hover:border-gray-200 group transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <module.icon size={16} className="text-gray-400 group-hover:text-[#005c8d]" />
                      <span className="text-[13px] font-medium text-gray-700 group-hover:text-[#005c8d]">{module.name}</span>
                    </div>
                    <ChevronRight size={14} className="text-gray-300" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-1 mb-3 uppercase tracking-tight">Statistika sustava</h3>
            <div className="bg-[#f8f9fa] border border-gray-200 overflow-hidden">
              <table className="ed-table-dense">
                <tbody>
                  <tr>
                    <td className="font-bold text-gray-600 bg-slate-50 w-1/2">Broj učenika:</td>
                    <td className="text-right font-bold">{stats.students}</td>
                  </tr>
                  <tr>
                    <td className="font-bold text-gray-600 bg-slate-50">Broj nastavnika:</td>
                    <td className="text-right font-bold">{stats.teachers}</td>
                  </tr>
                  <tr>
                    <td className="font-bold text-gray-600 bg-slate-50">Broj razrednih odjela:</td>
                    <td className="text-right font-bold">{stats.classes}</td>
                  </tr>
                  <tr>
                    <td className="font-bold text-gray-600 bg-slate-50">Ukupno predmeta:</td>
                    <td className="text-right font-bold">{stats.subjects}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 p-3 bg-blue-50 border border-blue-100 text-[11px] text-blue-800 leading-relaxed">
              <strong>Napomena:</strong> Administracija škole omogućuje upravljanje korisnicima, razredima i predmetima za tekuću školsku godinu. Za arhivirane podatke koristite izbornik "Arhiva".
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
