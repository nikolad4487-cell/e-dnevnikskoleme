import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { logSystemAction } from '../../utils/auditLogger';
import { 
  FileText, Search, Printer, Filter, Calendar, GraduationCap, Building, 
  MapPin, ShieldAlert, BadgeInfo, Users, ArrowLeft, ArrowRight, BookOpen, Edit2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerUnicodeFont } from '../../lib/pdfGenerator';

interface StudentRegistryItem {
  id: string;
  name: string;
  surname?: string;
  oib?: string;
  dob?: string;
  pob?: string;
  country_of_birth?: string;
  address?: string;
  parent_names?: string;
  program_name: string;
  class_name: string;
  school_year: string;
  program_id?: string;
  class_id?: string;
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
  const [programs, setPrograms] = useState<any[]>([]);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const [filteredClasses, setFilteredClasses] = useState<any[]>([]);

  useEffect(() => {
    let newFilteredClasses = classes;
    if (selectedYear) {
      newFilteredClasses = classes.filter(c => c.school_year === selectedYear);
    }
    setFilteredClasses(newFilteredClasses);
    
    console.log("[MATICNA] selectedSchoolYear", selectedYear);
    console.log("[MATICNA] availableClasses", newFilteredClasses);
    console.log("[MATICNA] selectedClass", selectedClass);

    // If selected class is no longer in the list, reset it
    if (selectedClass && !newFilteredClasses.some(c => c.name === selectedClass)) {
      setSelectedClass('');
    }
  }, [selectedYear, classes]);

  const [editingStudent, setEditingStudent] = useState<StudentRegistryItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    surname: '',
    oib: '',
    dob: '',
    pob: '',
    country_of_birth: '',
    address: '',
    program_id: '',
    class_id: '',
    status: ''
  });

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
      const { data: programsData } = await supabase
        .from('programs')
        .select('id, name')
        .eq('school_id', selectedSchoolId);
      setPrograms(programsData || []);

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

      // 6. Fetch Parents
      const { data: parentsData } = await supabase
        .from('student_parent_contacts')
        .select('student_id, parent_name');

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
        const enrollProgram = enrollClass ? (programsData || []).find(p => p.id === enrollClass.program_id) : null;

        const pData = (parentsData || []).filter(p => p.student_id === profile.id);
        const parentNames = pData.map(p => p.parent_name).filter(n => n && n.length > 0).join(', ');

        list.push({
          id: profile.id,
          name: profile.name || '',
          surname: profile.surname || '',
          oib: profile.oib || 'Nije zaveden',
          dob: profile.dob || 'Nepoznat',
          pob: profile.pob || 'Nije zavedeno',
          country_of_birth: profile.country_of_birth || 'HR',
          address: profile.address || 'Nepoznata adresa',
          parent_names: parentNames,
          program_name: enrollProgram?.name || 'Opći smjer',
          school_year: activeEnr?.school_year || 'Nije upisana',
          class_name: enrollClass?.name || 'Nije raspoređen',
          program_id: enrollProgram?.id,
          class_id: enrollClass?.id,
          status: role.status || 'ACTIVE'
        });
      });

      // Sort alphabetically by surname -> name
      list.sort((a,b) => {
        if (a.surname !== b.surname) return (a.surname||'').localeCompare(b.surname||'');
        return (a.name||'').localeCompare(b.name||'');
      });

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
      console.log("[MATIČNA] Print clicked");
      if (!selectedSchoolId) return;

      const { data: schoolData } = await supabase.from('schools').select('name').eq('id', selectedSchoolId).single();
      const schoolName = schoolData?.name || 'Škola';

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

      console.log("[MATIČNA] Generating report");
      const doc = new jsPDF('landscape');
      await registerUnicodeFont(doc);
      doc.setFont('NotoSans', 'normal');
      
      doc.setFontSize(16);
      doc.setFont('NotoSans', 'bold');
      doc.text(`MATIČNA KNJIGA UČENIKA`, 14, 20);
      doc.setFontSize(12);
      doc.setFont('NotoSans', 'normal');
      doc.text(`Škola: ${schoolName}`, 14, 28);
      
      let startY = 34;
      if (selectedYear) {
         doc.text(`Školska godina: ${selectedYear}`, 14, startY);
         startY += 6;
      }
      if (selectedClass) {
         doc.text(`Razred: ${selectedClass}`, 14, startY);
         startY += 6;
      }

      const bodyData = filteredStudents.map((st, i) => [
        (i + 1).toString(),
        `${st.surname || ''} ${st.name || ''}`,
        st.oib || '',
        st.dob && st.dob !== 'Nepoznat' ? new Date(st.dob).toLocaleDateString('hr-HR') : '',
        st.pob || '',
        st.parent_names || '',
        st.address || '',
        st.program_name || '',
        st.class_name || ''
      ]);

      autoTable(doc, {
        startY: startY + 5,
        head: [['R.br.', 'Prezime i Ime', 'OIB', 'Datum r.', 'Mjesto r.', 'Roditelji/Skrbnici', 'Adresa', 'Program', 'Razred']],
        body: bodyData,
        theme: 'grid',
        headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', font: 'NotoSans' },
        styles: { fontSize: 8, cellPadding: 2, font: 'NotoSans' }
      });

      doc.save(`MaticnaKnjiga_${new Date().toISOString().split('T')[0]}.pdf`);
      console.log("[MATIČNA] PDF generated");
    } catch (e: any) {
      console.error("[MATIČNA] Error", e);
      toast.error('Dogodila se greška prilikom ispisa pdf-a.');
    }
  };

  const handlePrintStudent = async (student: StudentRegistryItem) => {
    try {
      console.log(`[MATIČNA] Print student clicked: ${student.id}`);
      
      const { data: schoolData } = await supabase.from('schools').select('name').eq('id', selectedSchoolId).single();
      const schoolName = schoolData?.name || 'Škola';
      
      console.log("[MATIČNA] Generating report");
      const doc = new jsPDF('portrait');
      await registerUnicodeFont(doc);
      doc.setFont('NotoSans', 'normal');
      
      doc.setFontSize(16);
      doc.setFont('NotoSans', 'bold');
      doc.text(`IZVADAK IZ MATIČNE KNJIGE UČENIKA`, 14, 20);
      doc.setFontSize(12);
      doc.setFont('NotoSans', 'normal');
      doc.text(`Škola: ${schoolName}`, 14, 28);
      
      let startY = 40;
      doc.setFont('NotoSans', 'bold');
      doc.text(`Podaci o učeniku:`, 14, startY);
      doc.setFont('NotoSans', 'normal');
      startY += 10;
      doc.setFontSize(10);
      doc.text(`Ime i prezime: ${student.name} ${student.surname || ''}`, 14, startY); startY += 6;
      doc.text(`OIB: ${student.oib || ''}`, 14, startY); startY += 6;
      doc.text(`Datum rođenja: ${student.dob && student.dob !== 'Nepoznat' ? new Date(student.dob).toLocaleDateString('hr-HR') : ''}`, 14, startY); startY += 6;
      doc.text(`Mjesto i država rođenja: ${student.pob || ''}, ${student.country_of_birth || ''}`, 14, startY); startY += 6;
      doc.text(`Adresa: ${student.address || ''}`, 14, startY); startY += 6;
      doc.text(`Roditelji/skrbnici: ${student.parent_names || ''}`, 14, startY); startY += 12;
      
      doc.setFontSize(12);
      doc.setFont('NotoSans', 'bold');
      doc.text(`Podaci o obrazovanju:`, 14, startY);
      doc.setFont('NotoSans', 'normal');
      startY += 10;
      doc.setFontSize(10);
      doc.text(`Program: ${student.program_name}`, 14, startY); startY += 6;
      doc.text(`Razred: ${student.class_name}`, 14, startY); startY += 6;
      doc.text(`Školska godina: ${student.school_year}`, 14, startY); startY += 6;
      doc.text(`Status: ${student.status === 'ACTIVE' ? 'Aktivna' : student.status === 'GRADUATED' ? 'Završio' : 'Ispisan'}`, 14, startY); startY += 6;
      
      doc.save(`Izvadak_${student.name}_${student.surname}.pdf`);
      console.log("[MATIČNA] PDF generated");
      toast.success('PDF izvadak je preuzet.');
    } catch (e: any) {
      console.error("[MATIČNA] Error", e);
      toast.error('Dogodila se greška prilikom ispisa pdf-a.');
    }
  };

  const openEditModal = (st: StudentRegistryItem) => {
    setEditingStudent(st);
    setEditForm({
      name: st.name || '',
      surname: st.surname || '',
      oib: st.oib === 'Nije zaveden' ? '' : st.oib || '',
      dob: st.dob === 'Nepoznat' ? '' : st.dob || '',
      pob: st.pob === 'Nije zavedeno' ? '' : st.pob || '',
      country_of_birth: st.country_of_birth || 'HR',
      address: st.address === 'Nepoznata adresa' ? '' : st.address || '',
      program_id: st.program_id || '',
      class_id: st.class_id || '',
      status: st.status || 'ACTIVE'
    });
  };

  const saveEditedStudent = async () => {
    if (!editingStudent) return;
    if (!editForm.oib || editForm.oib.length !== 11) {
      toast.error('OIB mora sadržavati točno 11 znamenki.');
      return;
    }
    try {
      setLoading(true);
      // Updates user_profiles table with core info
      const { error: profileError } = await supabase.from('user_profiles').update({
        name: editForm.name,
        surname: editForm.surname,
        oib: editForm.oib,
        dob: editForm.dob || null,
        pob: editForm.pob,
        country_of_birth: editForm.country_of_birth,
        address: editForm.address
      }).eq('id', editingStudent.id);

      if (profileError) throw profileError;

      // Update enrollment if changed
      if (editForm.class_id !== editingStudent.class_id || editForm.status !== editingStudent.status) {
         console.log("[MATICNA] UPDATING ENROLLMENT", { student_id: editingStudent.id, editForm });
         const { data, error: enrError } = await supabase.from('student_class_enrollments')
            .update({ 
               class_id: editForm.class_id, 
               program_id: editForm.program_id || null,
               status: editForm.status
            })
            .eq('student_id', editingStudent.id)
            .eq('status', editingStudent.status); // Target the old status to ensure we find the record
         
         console.log("[MATICNA] SAVE ENROLLMENT RESULT", { data, error: enrError });
            
         if (enrError) throw enrError;
      }

      toast.success('Podaci učenika su uspješno ažurirani.');
      setEditingStudent(null);
      loadRegistryData();
    } catch (e: any) {
      console.error("[MATICNA] SAVE STUDENT ERROR", e);
      toast.error('Greška pri spremanju učenika: ' + (e.message || 'Nepoznata greška'));
      setLoading(false);
    }
  };

  const navigate = useNavigate();

  if (loading) {
    return <div className="p-8 text-center animate-pulse text-xs font-black uppercase text-slate-300">Učitavanje matične knjige...</div>;
  }

  return (
    <div className="p-6 font-sans bg-[#f8f9fa] min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
      {/* Printable CSS style snippet */}
      <style>{`
        @media print {
          body { color: #000; background: #fff; padding: 0; margin: 1cm; font-size: 10px; }
          header, nav, .print-hidden, .button, button, footer { display: none !important; }
          .print-container { width: 100% !important; margin: 0 !important; border: none !important; box-shadow: none !important; }
          table { width: 100% !important; border-collapse: collapse !important; font-size: 9px !important; }
          th, td { border: 1px solid #000 !important; padding: 6px !important; text-align: left !important; }
          th { background-color: #f1f5f9 !important; font-weight: bold !important; text-transform: uppercase !important; }
          .print-header { display: block !important; text-align: center; margin-bottom: 20px; }
        }
        @media screen {
          .print-header { display: none; }
        }
      `}</style>

      {/* Screen Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 border-b border-[#dee2e6] pb-6 print-hidden">
        <div>
          <div className="flex items-center gap-2 text-[#005c8d] text-xs font-black uppercase tracking-widest mb-2 cursor-pointer hover:underline" onClick={() => navigate('/admin-skole')}>
            <ArrowLeft size={14} /> Natrag u administraciju
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Matična knjiga učenika</h1>
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
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setSelectedClass('');
            }}
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
            {filteredClasses.map(c => (
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
                <th className="p-3 font-bold text-slate-900 uppercase text-[10px] text-center print-hidden">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-420 italic uppercase font-bold text-xs bg-slate-50/50">
                    Nema unesenih zapisa u matičnoj knjizi prema zadanim parametrima.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, i) => (
                  <tr key={student.id} className="border-b border-slate-200 hover:bg-slate-50/40 font-medium">
                    <td className="p-3 border-r text-center font-bold text-slate-500 w-[45px]">{i + 1}.</td>
                    <td className="p-3 border-r text-slate-950 font-black uppercase text-xs">{student.name} {student.surname}</td>
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
                    <td className="p-3 text-center border-r">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                        student.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        student.status === 'GRADUATED' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                        'bg-slate-100 text-slate-800 border-slate-200'
                      }`}>
                        {student.status === 'ACTIVE' ? 'Aktivna' : student.status === 'GRADUATED' ? 'Završio' : 'Ispisan'}
                      </span>
                    </td>
                    <td className="p-3 text-center print-hidden">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditModal(student)} className="p-1 px-1.5 flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-[9px] font-bold uppercase transition-colors" title="Pregled">
                          <BookOpen size={12}/>
                        </button>
                        <button onClick={() => openEditModal(student)} className="p-1 px-1.5 flex items-center gap-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded text-[9px] font-bold uppercase transition-colors" title="Uredi">
                          <Edit2 size={12}/>
                        </button>
                        <button onClick={() => handlePrintStudent(student)} className="p-1 px-1.5 flex items-center gap-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[9px] font-bold uppercase transition-colors" title="Ispis izvatka">
                          <Printer size={12}/>
                        </button>
                      </div>
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
        <span>Ukupno evidentiranih stavki: <span className="text-slate-800">{filteredStudents.length} učenika</span></span>
        <span>Aktivna baza: <span className="text-emerald-700 font-bold">Usklađeno</span></span>
      </div>

      {editingStudent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center text-slate-800">
              <h2 className="text-sm font-black uppercase tracking-wider">Uređivanje podataka učenika</h2>
              <button 
                onClick={() => setEditingStudent(null)} 
                className="text-slate-400 hover:text-slate-600 font-bold"
              >✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Ime</label>
                  <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Prezime</label>
                  <input type="text" value={editForm.surname} onChange={e => setEditForm({...editForm, surname: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">OIB</label>
                  <input 
                    type="text" 
                    maxLength={11}
                    value={editForm.oib} 
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '');
                      setEditForm({...editForm, oib: value.slice(0, 11)});
                    }} 
                    className="w-full border border-slate-200 rounded p-2 text-xs font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Datum rođenja</label>
                  <input type="date" value={editForm.dob} onChange={e => setEditForm({...editForm, dob: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Mjesto rođenja</label>
                  <input type="text" value={editForm.pob} onChange={e => setEditForm({...editForm, pob: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Država rođenja</label>
                  <input type="text" value={editForm.country_of_birth} onChange={e => setEditForm({...editForm, country_of_birth: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Adresa stanovanja</label>
                  <input type="text" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Roditelji / Skrbnici (Prikaz)</label>
                  <input type="text" disabled value={editingStudent.parent_names} className="w-full border border-slate-200 rounded p-2 text-xs bg-slate-50 font-medium" />
                  <p className="text-[9px] text-slate-400 mt-1">Uređivanje u modulu Korisnici &rarr; Roditelji.</p>
                </div>
              </div>

              <div className="border-t border-slate-100 mt-4 pt-4">
                <h3 className="text-xs font-bold uppercase text-slate-700 mb-3 block">Obrazovni status</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Školska godina (Aktivni upis)</label>
                    <input type="text" disabled value={editingStudent.school_year} className="w-full border border-slate-200 rounded p-2 text-xs bg-slate-50" />
                  </div>
                  <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Status u školi</label>
                      <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs">
                        <option value="ACTIVE">Aktivan</option>
                        <option value="TRANSFERRED">Preseljen</option>
                        <option value="GRADUATED">Maturirao/Završio</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Program</label>
                    <select value={editForm.program_id} onChange={e => setEditForm({...editForm, program_id: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs">
                      <option value="">-- Bez programa --</option>
                      {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Razred</label>
                    <select value={editForm.class_id} onChange={e => setEditForm({...editForm, class_id: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-xs">
                      <option value="">-- Bez razreda --</option>
                      {classes.filter(c => c.school_year === editingStudent.school_year).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50/50 flex justify-end gap-3">
              <button 
                onClick={() => setEditingStudent(null)} 
                className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-800 transition"
              >Odustani</button>
              <button 
                onClick={saveEditedStudent}
                className="px-5 py-2 text-xs font-black uppercase text-white bg-[#005c8d] rounded hover:bg-[#00476b] transition-all flex items-center gap-2"
              >
                Spremi promjene
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
