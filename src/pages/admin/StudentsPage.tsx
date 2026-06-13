import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  User, 
  ArrowLeft, 
  Search, 
  Filter, 
  GraduationCap, 
  MoveRight,
  Mail,
  UserCheck,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Role } from '../../types';
import { sortStudentsBySurname } from '../../lib/utils';

interface StudentProfile {
  id: string; // user profile id
  auth_user_id: string;
  name: string;
  email: string;
  oib: string;
  address: string;
  dob: string;
  pob: string;
  mobile: string;
  status: string; // school role status
  roleId: string; // user_school_role id
  enrollmentId?: string;
  classId?: string;
  className?: string;
  schoolYearId?: string;
  schoolYearName?: string;
}

interface SchoolClass {
  id: string;
  name: string;
  school_year: string;
  school_year_id: string;
}

export default function StudentsPage() {
  const { selectedSchoolId } = useSelection();
  const { user, userSchoolRoles } = useAuth();
  const navigate = useNavigate();

  // Resolve School ID
  let schoolId = selectedSchoolId;
  if (!schoolId) {
    if (user && (user as any).school_id) {
      schoolId = (user as any).school_id;
    } else if (user && (user as any).schoolId) {
      schoolId = (user as any).schoolId;
    } else if (userSchoolRoles && userSchoolRoles.length > 0) {
      schoolId = userSchoolRoles[0].schoolId;
    } else if (user && (user as any).roles && (user as any).roles.length > 0) {
      schoolId = (user as any).roles[0].school_id || (user as any).roles[0].schoolId;
    }
  }

  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [schoolYears, setSchoolYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');

  // Modal / Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);

  // Form Field states (Adding / Editing)
  const [ime, setIme] = useState('');
  const [prezime, setPrezime] = useState('');
  const [email, setEmail] = useState('');
  const [oib, setOib] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [pob, setPob] = useState('');
  const [mobile, setMobile] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [status, setStatus] = useState('ACTIVE');

  // Move student states
  const [moveToClassId, setMoveToClassId] = useState('');

  useEffect(() => {
    if (schoolId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [schoolId]);

  const fetchData = async () => {
    if (!schoolId) return;
    try {
      setLoading(true);

      // 1. Fetch Classes for selection
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, name, school_year, school_year_id')
        .eq('school_id', schoolId)
        .order('grade_level')
        .order('name');
      if (classError) throw classError;
      setClasses(classData || []);

      // 2. Fetch school years
      const { data: yearData } = await supabase
        .from('school_years')
        .select('*')
        .eq('school_id', schoolId);
      setSchoolYears(yearData || []);

      // 3. Fetch Student Roles in school
      const { data: studentRoles, error: rolesError } = await supabase
        .from('user_school_roles')
        .select(`
          id,
          user_id,
          status,
          user:user_profiles (*)
        `)
        .eq('school_id', schoolId)
        .eq('role', 'STUDENT');
      if (rolesError) throw rolesError;

      // 4. Fetch enrollments
      const { data: enrollments, error: enrollError } = await supabase
        .from('student_class_enrollments')
        .select(`
          id,
          student_id,
          class_id,
          school_year,
          school_year_id,
          status
        `);
      if (enrollError) throw enrollError;

      // Map everything together
      const enrollmentMap = new Map<string, any>();
      enrollments?.forEach(enroll => {
        // Can map student_id -> latest or active enrollment
        const existing = enrollmentMap.get(enroll.student_id);
        if (!existing || enroll.status === 'ACTIVE') {
          enrollmentMap.set(enroll.student_id, enroll);
        }
      });

      const mappedStudents: StudentProfile[] = (studentRoles || []).map(roleRow => {
        const p = roleRow.user as any;
        const enroll = enrollmentMap.get(roleRow.user_id);
        const cls = classData?.find(c => c.id === enroll?.class_id);

        // Split name if needed for separate inputs
        return {
          id: p?.id || '',
          auth_user_id: p?.auth_user_id || '',
          name: p?.name || 'Nepoznato',
          email: p?.email || '',
          oib: p?.oib || '',
          address: p?.address || '',
          dob: p?.dob || '',
          pob: p?.pob || '',
          mobile: p?.mobile || '',
          status: roleRow.status || 'ACTIVE',
          roleId: roleRow.id,
          enrollmentId: enroll?.id,
          classId: enroll?.class_id,
          className: cls?.name || 'Neraspoređeni',
          schoolYearId: enroll?.school_year_id,
          schoolYearName: enroll?.school_year || cls?.school_year
        };
      });

      setStudents(mappedStudents);
    } catch (err: any) {
      console.error("fetchData students page error", err);
      toast.error('Pogreška pri preuzimanju podataka: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (student?: StudentProfile) => {
    if (student) {
      setSelectedStudent(student);
      // Try splitting the name into name and surname
      const nameParts = student.name.split(' ');
      setIme(nameParts[0] || '');
      setPrezime(nameParts.slice(1).join(' ') || '');
      setEmail(student.email);
      setOib(student.oib);
      setAddress(student.address);
      setDob(student.dob);
      setPob(student.pob);
      setMobile(student.mobile);
      setSelectedClassId(student.classId || '');
      setStatus(student.status);
    } else {
      setSelectedStudent(null);
      setIme('');
      setPrezime('');
      setEmail('');
      setOib('');
      setAddress('');
      setDob('');
      setPob('');
      setMobile('');
      setSelectedClassId('');
      setStatus('ACTIVE');
    }
    setIsFormOpen(true);
  };

  const handleOpenMove = (student: StudentProfile) => {
    setSelectedStudent(student);
    setMoveToClassId(student.classId || '');
    setIsMoveOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ime.trim() || !prezime.trim()) {
      toast.error('Molimo unesite ime i prezime');
      return;
    }

    try {
      setLoading(true);
      const fullName = `${ime.trim()} ${prezime.trim()}`;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("SAVE USER SUPABASE SESSION ERROR", sessionError);
        throw sessionError;
      }
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Nedostaje autorizacijski token. Prijavite se ponovno.");
      }

      if (selectedStudent) {
        // Edit flow
        const payload = {
          profileId: selectedStudent.id,
          authUserId: selectedStudent.auth_user_id,
          email,
          name: ime.trim(),
          surname: prezime.trim(),
          address,
          oib,
          roles: ['STUDENT'],
          schoolId
        };

        console.log("SAVE USER PAYLOAD", payload);
        const res = await fetch('/api/admin/update-user', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        });

        console.log("SAVE USER STATUS", res.status);
        const text = await res.text();
        console.log("SAVE USER RAW RESPONSE", text);
        let errData = null;
        if (text) {
          try {
            errData = JSON.parse(text);
          } catch (parseError) {
            console.error("SAVE USER JSON PARSE ERROR", parseError, text);
          }
        }

        if (!res.ok) {
          throw new Error(errData?.error || errData?.message || text || `HTTP ${res.status}: Ažuriranje učenika nije uspjelo`);
        }

        // Also update dob, pob, mobile in user_profiles since update-user API might miss them
        await supabase
          .from('user_profiles')
          .update({ dob: dob || null, pob: pob || null, mobile: mobile || null })
          .eq('id', selectedStudent.id);

        // Update class enrollment if changed
        if (selectedClassId !== selectedStudent.classId) {
          if (selectedClassId) {
            const cls = classes.find(c => c.id === selectedClassId);
            await supabase.from('student_class_enrollments').upsert({
              student_id: selectedStudent.id,
              class_id: selectedClassId,
              school_year_id: cls?.school_year_id || null,
              school_year: cls?.school_year || '2026./2027.',
              status: 'ACTIVE'
            }, { onConflict: 'student_id,class_id,school_year' });
          } else {
            // Delete old enrollment row or set inactive
            if (selectedStudent.enrollmentId) {
              await supabase
                .from('student_class_enrollments')
                .delete()
                .eq('id', selectedStudent.enrollmentId);
            }
          }
        }

        // Update status in user_school_roles
        await supabase
          .from('user_school_roles')
          .update({ status })
          .eq('id', selectedStudent.roleId);

        toast.success('Učenik je uspješno ažuriran.');
      } else {
        // Add new student flow
        const payload = {
          name: ime.trim(),
          surname: prezime.trim(),
          email: email.trim() || undefined, // empty email let the server generate one
          address,
          oib,
          dob,
          pob,
          mobile,
          roles: ['STUDENT'],
          schoolId,
          classId: selectedClassId || undefined
        };

        console.log("SAVE USER PAYLOAD", payload);
        const res = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        });

        console.log("SAVE USER STATUS", res.status);
        const text = await res.text();
        console.log("SAVE USER RAW RESPONSE", text);
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            console.error("SAVE USER JSON PARSE ERROR", parseError, text);
          }
        }

        if (!res.ok || (data && data.success === false)) {
          throw new Error(data?.error || data?.message || text || `HTTP ${res.status}: Stvaranje učenika nije uspjelo`);
        }
        
        // Let's check if the user has specified extra parameters (dob, pob, mobile)
        // because create-user API might not save those inside custom properties.
        if (data.profileId) {
          await supabase
            .from('user_profiles')
            .update({ dob: dob || null, pob: pob || null, mobile: mobile || null })
            .eq('id', data.profileId);
        }

        toast.success(`Učenik je uspješno dodan. Lozinka za učenika je: ${data.password || 'yupu8Ev4'}`);
      }

      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error('Greška pri spremanju učenika: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    try {
      setLoading(true);

      if (!moveToClassId) {
        // Deselecting class enrollment or removing
        if (selectedStudent.enrollmentId) {
          const { error } = await supabase
            .from('student_class_enrollments')
            .delete()
            .eq('id', selectedStudent.enrollmentId);
          if (error) throw error;
        }
        toast.success('Učenik je maknut iz razreda.');
      } else {
        const cls = classes.find(c => c.id === moveToClassId);
        if (!cls) throw new Error('Razred nije pronađen.');

        const { error } = await supabase
          .from('student_class_enrollments')
          .upsert({
            student_id: selectedStudent.id,
            class_id: moveToClassId,
            school_year_id: cls.school_year_id || null,
            school_year: cls.school_year || '2026./2027.',
            status: 'ACTIVE'
          }, { onConflict: 'student_id,class_id,school_year' });

        if (error) throw error;
        toast.success(`Učenik je uspješno premješten u razred ${cls.name}.`);
      }

      setIsMoveOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error('Premještanje nije uspjelo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (student: StudentProfile) => {
    if (!window.confirm(`Jeste li sasvim sigurni da želite obrisati učenika "${student.name}" iz baze sustava? Svi korisnički dosjei, ocjene i izostanci u ovoj školi bit će obrisani i nepovratno izgubljeni.`)) {
      return;
    }

    try {
      setLoading(true);

      // Perform cascade deletes first just in case table references are strict
      await Promise.all([
        supabase.from('grades').delete().eq('student_id', student.id),
        supabase.from('absences').delete().eq('student_id', student.id),
        supabase.from('student_class_enrollments').delete().eq('student_id', student.id),
        supabase.from('student_subject_enrollments').delete().eq('student_id', student.id),
        supabase.from('student_year_summaries').delete().eq('student_id', student.id),
        supabase.from('user_school_roles').delete().eq('user_id', student.id),
      ]);

      // Use Server deletion endpoint to completely destroy authentication record and user_profile safely
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("DELETE USER SUPABASE SESSION ERROR", sessionError);
        throw sessionError;
      }
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Nedostaje autorizacijski token. Prijavite se ponovno.");
      }
      const deletePayload = { profileId: student.id, schoolId, softDelete: false };
      console.log("DELETE USER PAYLOAD", deletePayload);
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(deletePayload)
      });

      console.log("DELETE STATUS", response.status);
      const raw = await response.text();
      console.log("DELETE RAW RESPONSE", raw);
      let result = null;
      if (raw) {
        try {
          result = JSON.parse(raw);
        } catch (parseError) {
          console.error("DELETE JSON PARSE ERROR", parseError, raw);
        }
      }
      if (!response.ok) {
        throw new Error(result?.error || result?.message || raw || `HTTP ${response.status}: Brisanje nije uspjelo`);
      }
      if (result?.success === false) {
        throw new Error(result.error || result.message || raw || 'Brisanje nije uspjelo');
      }
      console.log("DELETE SUCCESS", result);

      toast.success('Učenik je uspješno obrisan.');
      fetchData();
    } catch (err: any) {
      toast.error('Brisanje nije uspjelo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter students in-memory
  const rawFiltered = students.filter(student => {
    const matchesSearch = 
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.oib.includes(searchTerm);

    const matchesClass = classFilter === 'ALL' || student.classId === classFilter;

    return matchesSearch && matchesClass;
  });
  const filteredStudents = sortStudentsBySurname(rawFiltered);

  return (
    <div className="p-6 font-sans bg-[#f8f9fa] min-h-screen">
      <div className="max-w-7xl mx-auto">
        
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-[#dee2e6] pb-6">
          <div>
            <div className="flex items-center gap-2 text-[#005c8d] text-xs font-black uppercase tracking-widest mb-2 cursor-pointer hover:underline" onClick={() => navigate('/admin-skole')}>
              <ArrowLeft size={14} /> Natrag u administraciju
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Učenici škole</h1>
            <p className="text-slate-500 font-medium text-sm">Upravljanje upisima učenika, razrednim odjelima i osobnim podacima</p>
          </div>
          
          <div>
            <button 
              id="add-student-btn"
              onClick={() => handleOpenForm()}
              className="bg-[#005c8d] text-white px-5 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-[#004a71] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Plus size={14} strokeWidth={3} />
              Dodaj novog učenika
            </button>
          </div>
        </div>

        {/* Filters panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2 bg-white px-4 py-3 rounded-sm border border-[#dee2e6] shadow-xs flex items-center gap-3">
            <Search size={18} className="text-slate-300" />
            <input 
              type="text" 
              placeholder="Pretraži učenike po imenu, emailu ili OIB-u..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-900 text-xs w-full"
            />
          </div>

          <div className="bg-white px-4 py-3 rounded-sm border border-[#dee2e6] shadow-xs flex items-center gap-3">
            <Filter size={18} className="text-slate-300" />
            <select 
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              className="bg-transparent border-none outline-none font-black text-slate-900 text-xs uppercase tracking-wider w-full"
            >
              <option value="ALL">Svi razredi</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.school_year})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading / Empty / Data */}
        {loading ? (
          <div className="flex justify-center py-20 text-[#005c8d] animate-pulse">
            <GraduationCap size={48} className="animate-bounce" />
          </div>
        ) : !schoolId ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 text-center rounded-sm text-sm font-bold">
            Greška: Nije odabrana aktivna škola. Navigirajte na popis škola kako biste je definirali.
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-white border border-[#dee2e6] rounded-sm p-12 text-center shadow-xs">
            <User size={40} className="mx-auto text-slate-300 mb-4" />
            <div className="text-sm font-extrabold text-slate-700 uppercase tracking-tight mb-2">Nema pronađenih učenika</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">Izmijenite filtere pretraživanja ili kreirajte novog učenika.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f1f3f5] border-b border-[#dee2e6] text-[11px] font-black uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-4">Ime i prezime</th>
                  <th className="px-6 py-4">Kontakt e-mail</th>
                  <th className="px-6 py-4">OIB</th>
                  <th className="px-6 py-4">Razredni odjel</th>
                  <th className="px-6 py-4">Školska godina</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Akcije</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dee2e6]">
                {filteredStudents.map(student => {
                  const inactive = student.status === 'INACTIVE';
                  
                  return (
                    <tr key={student.id} className="hover:bg-[#f8f9fa] transition-colors">
                      <td className="px-6 py-4 font-extrabold text-slate-800 text-sm uppercase">
                        {student.name}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Mail size={13} className="text-slate-400 shrink-0" />
                          {student.email || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-700 font-mono">
                        {student.oib || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-100 text-slate-800 text-[10px] font-black uppercase px-2 py-1 rounded">
                          {student.className}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">
                        {student.schoolYearName || '—'}
                      </td>
                      <td className="px-6 py-4">
                        {inactive ? (
                          <span className="bg-red-50 text-red-700 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-red-200">
                            NEAKTIVAN
                          </span>
                        ) : (
                          <span className="bg-green-50 text-green-700 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-green-200">
                            AKTIVAN
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenMove(student)}
                            className="bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 py-1.5 px-3 rounded-sm text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-colors cursor-pointer"
                            title="Premjesti u razred"
                          >
                            <MoveRight size={10} strokeWidth={3} /> Premjesti
                          </button>
                          
                          <button
                            onClick={() => handleOpenForm(student)}
                            className="p-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-sm cursor-pointer transition-colors"
                            title="Uredi"
                          >
                            <Edit2 size={13} />
                          </button>

                          <button
                            onClick={() => handleDeleteStudent(student)}
                            className="p-1.5 px-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-sm cursor-pointer transition-colors"
                            title="Obriši"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide overlay / Form Dialog for Add/Edit */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-sm shadow-2xl overflow-hidden border border-[#dee2e6] animate-in fade-in duration-150">
            <div className="bg-[#005c8d] p-6 text-white flex items-center justify-between">
              <h2 className="text-base font-black uppercase tracking-tight">
                {selectedStudent ? 'Uredi učenika' : 'Novi učenik'}
              </h2>
              <button onClick={() => setIsFormOpen(false)} className="text-white/80 hover:text-white font-extrabold text-xs uppercase">[ Zatvori ]</button>
            </div>

            <form onSubmit={handleSaveStudent} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Ime</label>
                  <input 
                    type="text" 
                    value={ime}
                    onChange={e => setIme(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Prezime</label>
                  <input 
                    type="text" 
                    value={prezime}
                    onChange={e => setPrezime(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">E-mail adresa</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Ostavite prazno za automatsko generiranje"
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">OIB</label>
                  <input 
                    type="text" 
                    value={oib}
                    onChange={e => setOib(e.target.value)}
                    maxLength={11}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Telefon / Mobitel</label>
                  <input 
                    type="text" 
                    value={mobile}
                    onChange={e => setMobile(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Datum rođenja</label>
                  <input 
                    type="date" 
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Mjesto rođenja</label>
                  <input 
                    type="text" 
                    value={pob}
                    onChange={e => setPob(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Adresa stanovanja</label>
                <input 
                  type="text" 
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Upisan u razred (Inicijalno)</label>
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  >
                    <option value="">— Neraspoređen —</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.school_year})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Status u školi</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  >
                    <option value="ACTIVE">Aktivno pohađanje</option>
                    <option value="INACTIVE">Neaktivno (Ispisan/Arhiviran)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#dee2e6]">
                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#005c8d] text-white py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-[#004a71] transition-all cursor-pointer shadow-md text-center"
                >
                  Spremi podatke
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Move Class Modal Dialog */}
      {isMoveOpen && selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-sm shadow-2xl overflow-hidden border border-[#dee2e6] animate-in fade-in duration-150">
            <div className="bg-[#005c8d] p-5 text-white flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-tight">Premjesti učenika</h2>
              <button onClick={() => setIsMoveOpen(false)} className="text-white/80 hover:text-white font-extrabold text-xs uppercase">[ Zatvori ]</button>
            </div>

            <form onSubmit={handleMoveClass} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">Premještanje učenika:</p>
                <p className="font-extrabold text-sm uppercase text-slate-800 border-b pb-2 mb-4">{selectedStudent.name}</p>
                
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Novi razredni odjel</label>
                <select
                  value={moveToClassId}
                  onChange={e => setMoveToClassId(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  required
                >
                  <option value="">— Neraspoređen —</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.school_year})</option>
                  ))}
                </select>
                
                <p className="text-[10px] text-amber-600 mt-2 flex gap-1.5 items-start">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  <span>
                    Ova promjena će premjestiti učenika u odabrani razredni odjel unutar pripadajuće školske godine.
                  </span>
                </p>
              </div>

              <div className="flex gap-2 pt-4 border-t border-[#dee2e6]">
                <button 
                  type="button"
                  onClick={() => setIsMoveOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-sm font-black uppercase tracking-wider text-[9px] hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#005c8d] text-white py-2.5 rounded-sm font-black uppercase tracking-wider text-[9px] hover:bg-[#004a71] transition-all cursor-pointer shadow-md text-center"
                >
                  Spremi promjenu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
