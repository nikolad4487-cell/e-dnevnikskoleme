import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { FolderArchive, Calendar, GraduationCap, Users, ArrowLeft, Loader2, Search, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

interface SchoolYear {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  status: string;
}

interface ArchivedClass {
  id: string;
  name: string;
  grade_level: number;
  section: string;
  school_year: string;
  homeroom_teacher: { name: string } | null;
  student_count?: number;
}

interface ArchivedStudent {
  id: string;
  name: string;
  surname: string;
  oib?: string;
  class_name: string;
  status: string;
}

export default function ArhivaPage() {
  const { selectedSchoolId } = useSelection();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [selectedYearName, setSelectedYearName] = useState<string>('');
  const [classes, setClasses] = useState<ArchivedClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<ArchivedStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!selectedSchoolId) {
      navigate('/admin/schools');
      return;
    }
    fetchSchoolYears();
  }, [selectedSchoolId]);

  const fetchSchoolYears = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('school_years')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('starts_at', { ascending: false });

      if (error) throw error;
      
      const yearsData = data || [];
      setYears(yearsData);

      // Select first archived year by default if one exists, otherwise fallback to any inactive, then active
      const archivedYear = yearsData.find(y => y.status === 'ARCHIVED' || !y.is_active) || yearsData[0];
      if (archivedYear) {
        setSelectedYearName(archivedYear.name);
      }
    } catch (err: any) {
      toast.error('Greška pri učitavanju školskih godina: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedYearName && selectedSchoolId) {
      fetchClassesForYear();
    }
  }, [selectedYearName, selectedSchoolId]);

  const fetchClassesForYear = async () => {
    try {
      setLoading(true);
      setSelectedClassId('');
      setStudents([]);

      // Fetch classes for this year
      const { data: classList, error: classError } = await supabase
        .from('classes')
        .select(`
          id,
          name,
          grade_level,
          section,
          school_year,
          homeroom:homeroom_teacher_id ( name )
        `)
        .eq('school_id', selectedSchoolId)
        .eq('school_year', selectedYearName);

      if (classError) throw classError;

      const items = (classList || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        grade_level: c.grade_level,
        section: c.section,
        school_year: c.school_year,
        homeroom_teacher: c.homeroom,
        student_count: 0
      })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'hr'));

      // Get student count per class for this year
      const { data: enrollments, error: enrollError } = await supabase
        .from('student_class_enrollments')
        .select('class_id')
        .eq('school_year', selectedYearName);

      if (!enrollError && enrollments) {
        items.forEach(cls => {
          cls.student_count = enrollments.filter(e => e.class_id === cls.id).length;
        });
      }

      setClasses(items);

      if (items.length > 0) {
        setSelectedClassId(items[0].id);
      }
    } catch (err: any) {
      toast.error('Greška pri učitavanju razreda: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClassId && selectedYearName) {
      fetchStudentsForClass();
    } else {
      setStudents([]);
    }
  }, [selectedClassId]);

  const fetchStudentsForClass = async () => {
    try {
      setLoading(true);
      
      // Get student enrollments in selected class
      const { data: enrollments, error: enrollError } = await supabase
        .from('student_class_enrollments')
        .select(`
          status,
          student:student_id ( id, name, oib )
        `)
        .eq('class_id', selectedClassId);

      if (enrollError) throw enrollError;

      const mappedStudents = (enrollments || [])
        .map((env: any) => {
          const profile = env.student;
          const cls = classes.find(c => c.id === selectedClassId);
          
          const fullName = profile?.name || '';
          const nameParts = fullName.trim().split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
          
          return {
            id: profile?.id || '',
            name: firstName,
            surname: lastName,
            oib: profile?.oib || 'Nije zaveden',
            class_name: cls?.name || '',
            status: env.status || 'ACTIVE'
          };
        })
        .filter(s => s.id)
        .sort((a, b) => (a.surname || '').localeCompare(b.surname || '', 'hr'));

      setStudents(mappedStudents);
    } catch (err: any) {
      toast.error('Greška pri učitavanju učenika: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.surname.toLowerCase().includes(q) ||
      s.oib?.includes(q)
    );
  });

  const selectedYearObj = years.find(y => y.name === selectedYearName);

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans">
      {/* Header bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/admin-skole')}
            className="p-1 px-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-all flex items-center gap-1.5 text-xs font-bold uppercase"
          >
            <ArrowLeft size={16} />
            Natrag
          </button>
          <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
          <FolderArchive size={20} className="text-[#005c8d]" />
          <div>
            <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight">Arhiva i povijesni podaci</h1>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Pregled i arhivirane školske godine</p>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        {/* Warning card */}
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-sm flex items-start gap-3">
          <FolderArchive className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider">Arhivirani podaci (Samo za čitanje)</h4>
            <p className="text-xs mt-1 leading-relaxed">
              Podaci prikazani unutar arhive odnose se na prethodne, položene ili prenesene školske godine. Izmjene nad arhiviranim podacima nisu omogućene radi integriteta školskih svjedodžbi i matične knjige.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Selectors */}
          <div className="space-y-4 lg:col-span-1">
            {/* Year Selector card */}
            <div className="bg-white border border-slate-200 p-4 shadow-sm rounded-sm">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                1. Odaberite školsku godinu
              </label>
              <div className="space-y-1">
                {years.map(y => (
                  <button
                    key={y.id}
                    onClick={() => setSelectedYearName(y.name)}
                    className={`w-full text-left p-2.5 rounded-sm text-xs font-bold uppercase transition-all flex items-center justify-between border ${
                      selectedYearName === y.name
                        ? "bg-[#005c8d] text-white border-[#005c8d]"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Calendar size={14} />
                      {y.name}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                      y.is_active || y.status === 'ACTIVE'
                        ? "bg-emerald-500 text-white"
                        : "bg-purple-600 text-white"
                    }`}>
                      {y.status === 'ARCHIVED' || !y.is_active ? 'ARHIVIRANA' : 'AKTIVNA'}
                    </span>
                  </button>
                ))}
                {years.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-4">Nema definiranih školskih godina.</div>
                )}
              </div>
            </div>

            {/* Class Selector card */}
            <div className="bg-white border border-slate-200 p-4 shadow-sm rounded-sm">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                2. Odaberite razredni odjel ({classes.length})
              </label>
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {classes.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClassId(c.id)}
                    className={`w-full text-left p-2 rounded-sm text-xs font-bold transition-all flex items-center justify-between border ${
                      selectedClassId === c.id
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 uppercase">
                      <GraduationCap size={14} />
                      {c.name}
                    </span>
                    <span className="text-[10px] opacity-75">{c.student_count || 0} učenika</span>
                  </button>
                ))}
                {classes.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-4">Nema razreda za odabranu godinu.</div>
                )}
              </div>
            </div>
          </div>

          {/* Students Explorer */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Učenici u razrednom odjelu {classes.find(c => c.id === selectedClassId)?.name || '...'} ({filteredStudents.length})
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">
                    Razrednik: {classes.find(c => c.id === selectedClassId)?.homeroom_teacher?.name || 'Nije dodijeljen'}
                  </p>
                </div>

                <div className="relative w-full md:w-64">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Pretraži arhivu po imenu, OIB-u..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 placeholder:text-slate-400 font-medium"
                  />
                </div>
              </div>

              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="animate-spin text-[#005c8d]" size={24} />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Učitavanje arhivskih zapisa...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[#005c8d] font-bold uppercase tracking-wider">
                        <th className="p-3 text-center w-12">R.br.</th>
                        <th className="p-3">Učenik</th>
                        <th className="p-3">OIB</th>
                        <th className="p-3">Razred</th>
                        <th className="p-3">Školska godina</th>
                        <th className="p-3 text-center">Status koda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, idx) => (
                        <tr key={student.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-center text-slate-400 font-medium">{idx + 1}.</td>
                          <td className="p-3 font-bold uppercase text-slate-800">
                            {student.surname} {student.name}
                          </td>
                          <td className="p-3 font-mono text-slate-500">{student.oib}</td>
                          <td className="p-3 font-semibold uppercase text-slate-600">{student.class_name}</td>
                          <td className="p-3 font-semibold text-slate-600">{selectedYearName}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${
                              student.status === 'ACTIVE' 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                : student.status === 'TRANSFERRED'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-purple-100 text-purple-800 border border-purple-200'
                            }`}>
                              {student.status === 'ACTIVE' ? 'SUDJELOVAO' : student.status === 'TRANSFERRED' ? 'PRESELJEN' : 'MATURIRAO'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredStudents.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            Nema pronađenih učenika za odabrani razredni odjel i filtre.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
