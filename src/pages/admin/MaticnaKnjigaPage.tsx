import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { logSystemAction } from '../../utils/auditLogger';
import { 
  FileText, Search, Printer, Filter, Calendar, GraduationCap, Building, 
  MapPin, ShieldAlert, BadgeInfo, Users
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface StudentRegistryItem {
  id: string;
  name: string;
  surname?: string;
  oib?: string;
  dob?: string;
  pob?: string;
  address?: string;
  program_name: string;
  school_year: string;
  class_name: string;
  status: string;
}

export default function MaticnaKnjigaPage() {
  const { selectedSchoolId } = useSelection();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRegistryItem[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<StudentRegistryItem[]>([]);
  const [schoolYears, setSchoolYears] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  useEffect(() => {
    if (!selectedSchoolId) return;
    loadRegistryData();
  }, [selectedSchoolId]);

  const loadRegistryData = async () => {
    try {
      setLoading(true);

      // Log the search/view action
      if (user?.id && selectedSchoolId) {
        await logSystemAction({
          executor_id: user.id,
          school_id: selectedSchoolId,
          action_type: 'VIEW_REGISTRY',
          entity_type: 'MATICNA_KNJIGA',
          entity_id: selectedSchoolId,
          new_value: { accessed_at: new Date().toISOString() }
        });
      }

      // 1. Fetch School Years
      const { data: years } = await supabase
        .from('school_years')
        .select('*')
        .eq('school_id', selectedSchoolId);
      setSchoolYears(years || []);

      // 2. Fetch Classes
      const { data: classList } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', selectedSchoolId);
      setClasses(classList || []);

      // 3. Fetch Programs
      const { data: programs } = await supabase
        .from('programs')
        .select('id, name')
        .eq('school_id', selectedSchoolId);

      // 4. Fetch Student Roles
      const { data: studentRoles, error: rolesError } = await supabase
        .from('user_school_roles')
        .select('user_id, status, user:user_profiles (*)')
        .eq('school_id', selectedSchoolId)
        .eq('role', 'STUDENT');

      if (rolesError) throw rolesError;

      // 5. Fetch Enrollments
      const { data: enrollments } = await supabase
        .from('student_class_enrollments')
        .select('student_id, class_id, school_year, status');

      // Map everything together
      const list: StudentRegistryItem[] = [];
      
      (studentRoles || []).forEach(role => {
        const profile = role.user as any;
        if (!profile) return;

        // Find active/newest enrollment
        const studentEnr = (enrollments || [])
          .filter(e => e.student_id === profile.id);
        const activeEnr = studentEnr.find(e => e.status === 'ACTIVE') || studentEnr[0];

        const enrollClass = activeEnr ? (classList || []).find(c => c.id === activeEnr.class_id) : null;
        const enrollProgram = enrollClass ? (programs || []).find(p => p.id === enrollClass.program_id) : null;

        list.push({
          id: profile.id,
          name: `${profile.surname || ''} ${profile.name || ''}`.trim() || 'Nepoznat učenik',
          surname: profile.surname || '',
          oib: profile.oib || 'Nije zaveden',
          dob: profile.dob || 'Nepoznat',
          pob: profile.pob || 'Nije zavedeno',
          address: profile.address || 'Nepoznata adresa',
          program_name: enrollProgram?.name || 'Opći smjer',
          school_year: activeEnr?.school_year || 'Nije upisana',
          class_name: enrollClass?.name || 'Nije raspoređen',
          status: role.status || 'ACTIVE'
        });
      });

      // Sort alphabetically by surname/name
      list.sort((a,b) => a.name.localeCompare(b.name));

      setStudents(list);
      setFilteredStudents(list);

    } catch (err: any) {
      console.error(err);
      toast.error('Nije moguće učitati matičnu knjigu učenika.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Apply Filters
    let res = [...students];

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      res = res.filter(x => 
        x.name.toLowerCase().includes(s) || 
        x.oib?.includes(s) || 
        x.address?.toLowerCase().includes(s)
      );
    }

    if (selectedYear) {
      res = res.filter(x => x.school_year === selectedYear);
    }

    if (selectedClass) {
      res = res.filter(x => x.class_name === selectedClass);
    }

    if (selectedStatus) {
      res = res.filter(x => x.status === selectedStatus);
    }

    setFilteredStudents(res);
  }, [searchTerm, selectedYear, selectedClass, selectedStatus, students]);

  const handlePrint = async () => {
    try {
      // Log the print action
      if (user?.id && selectedSchoolId) {
        await logSystemAction({
          executor_id: user.id,
          school_id: selectedSchoolId,
          action_type: 'PRINT_REGISTRY',
          entity_type: 'MATICNA_KNJIGA',
          entity_id: selectedSchoolId,
          new_value: { total_printed: filteredStudents.length }
        });
      }
      window.print();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="p-8 text-center animate-pulse text-xs font-black uppercase text-slate-300">Učitavanje matične knjige...</div>;
  }

  return (
    <div className="p-6 bg-white min-h-screen font-sans space-y-6">
      {/* Printable CSS style snippet */}
      <style>{`
        @media print {
          body {
            color: #000;
            background: #fff;
            padding: 0;
            margin: 1cm;
            font-size: 10px;
          }
          /* Hide sidebar, headers, and filters */
          header, nav, .print-hidden, .button, button, footer {
            display: none !important;
          }
          /* Ledger print layout */
          .print-container {
            width: 100% !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9px !important;
          }
          th, td {
            border: 1px solid #000 !important;
            padding: 6px !important;
            text-align: left !important;
          }
          th {
            background-color: #f1f5f9 !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
          }
          .print-header {
            display: block !important;
            text-align: center;
            margin-bottom: 20px;
          }
        }
        @media screen {
          .print-header {
            display: none;
          }
        }
      `}</style>

      {/* Screen Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4 print-hidden">
        <div>
          <span className="text-[10px] bg-slate-100 text-slate-700 font-black uppercase tracking-widest px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1.5 mb-1">
            <Building size={10} /> Službene Evidencije Škole
          </span>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Matična knjiga učenika</h1>
          <p className="text-xs text-slate-405 font-bold uppercase tracking-tight mt-0.5">Službeni registar učenika, programa, matičnih i osobnih podataka</p>
        </div>
        
        <button 
          onClick={handlePrint}
          className="bg-slate-900 text-white text-[10px] sm:text-xs font-black px-4 py-2 uppercase rounded-md shadow-sm hover:bg-slate-800 transition-all inline-flex items-center gap-2"
        >
          <Printer size={14} /> Ispis matične knjige
        </button>
      </div>

      {/* Screen Filters */}
      <div className="bg-slate-50 border border-slate-200 rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 print-hidden">
        {/* Search */}
        <div className="relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Pretraga učenika</label>
          <div className="relative">
            <span className="absolute left-2.5 top-2.5 text-slate-400">
              <Search size={14} />
            </span>
            <input 
              type="text" 
              placeholder="Ime, OIB, adresa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded pl-9 pr-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all"
            />
          </div>
        </div>

        {/* Year Filter */}
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Školska godina</label>
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
          >
            <option value="">SVE GODINE</option>
            {schoolYears.map(y => (
              <option key={y.id} value={y.name}>{y.name}</option>
            ))}
          </select>
        </div>

        {/* Class Filter */}
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Razredni odjel</label>
          <select 
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
          >
            <option value="">SVI RAZREDI</option>
            {classes.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Status u školi</label>
          <select 
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
          >
            <option value="">SVI STATUSI</option>
            <option value="ACTIVE">AKTIVAN</option>
            <option value="TRANSFERRED">PRESELJEN</option>
            <option value="GRADUATED">MATURIRAO/ZAVRŠIO</option>
          </select>
        </div>
      </div>

      {/* Official Print Header */}
      <div className="print-header">
        <h2 className="text-sm font-black uppercase text-slate-900 tracking-wide">Republika Hrvatska</h2>
        <h1 className="text-xl font-bold uppercase mt-1">MATIČNA KNJIGA UČENIKA</h1>
        <p className="text-xs uppercase font-medium tracking-tight mt-0.5">Službeni izvadak ureda škole</p>
        <p className="text-[9px] text-slate-500 uppercase font-bold mt-2">Datum ispisa: {new Date().toLocaleDateString('hr-HR')}</p>
        <hr className="border-black my-4" />
      </div>

      {/* Ledger Table Container */}
      <div className="bg-white border border-slate-300 shadow-sm overflow-hidden rounded print-container">
        <div className="overflow-x-auto w-full">
          <table className="w-full border-collapse text-left text-xs text-slate-700">
            <thead>
              <tr className="bg-slate-55 border-b border-slate-300">
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] border-r">R.br.</th>
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] border-r">Prezime i Ime</th>
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] border-r">OIB</th>
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] border-r text-center">Datum rođenja</th>
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] border-r text-center">Mjesto rođenja</th>
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] border-r">Adresa stanovanja</th>
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] border-r">Školska godina / Razred</th>
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] border-r">Obrazovni program</th>
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-420 italic uppercase font-bold text-xs bg-slate-50/50">
                    Nema unesenih zapisa u matičnoj knjizi prema zadanim parametrima.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, i) => (
                  <tr key={student.id} className="border-b border-slate-200 hover:bg-slate-50/40 font-medium">
                    <td className="p-3 border-r text-center font-bold text-slate-500 w-[45px]">{i + 1}.</td>
                    <td className="p-3 border-r text-slate-950 font-black uppercase text-xs">{student.name}</td>
                    <td className="p-3 border-r font-mono tracking-wide text-xs">{student.oib}</td>
                    <td className="p-3 border-r text-center text-xs whitespace-nowrap">
                      {student.dob !== 'Nepoznat' ? new Date(student.dob).toLocaleDateString('hr-HR') : '—'}
                    </td>
                    <td className="p-3 border-r text-center text-xs">{student.pob || '—'}</td>
                    <td className="p-3 border-r text-xs">{student.address}</td>
                    <td className="p-3 border-r text-xs">
                      <span className="font-bold block">{student.school_year}</span>
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase">Razred: {student.class_name}</span>
                    </td>
                    <td className="p-3 border-r text-xs leading-tight font-semibold text-slate-700">{student.program_name}</td>
                    <td className="p-3 text-center">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                        student.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        student.status === 'GRADUATED' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                        'bg-slate-100 text-slate-800 border-slate-200'
                      }`}>
                        {student.status === 'ACTIVE' ? 'Aktivna' : student.status === 'GRADUATED' ? 'Završio' : 'Ispisan'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Screen Stats Summary */}
      <div className="bg-slate-50 border rounded-md p-4 text-[10px] text-slate-500 uppercase font-black tracking-wide flex justify-between print-hidden">
        <span>Ukupno evidentiranih stavki: <span className="text-slate-870">{filteredStudents.length} učenika</span></span>
        <span>Aktivna baza: <span className="text-emerald-700 font-bold">Usklađeno</span></span>
      </div>
    </div>
  );
}
