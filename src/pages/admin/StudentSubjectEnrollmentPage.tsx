import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Subject, Role } from '../../types';
import { getSurname, matchesSearch, sortStudentsBySurname, formatSubjectName } from '../../lib/utils';
import { mappers, mapList } from '../../lib/mappers';
import { useAuth } from '../../contexts/AuthContext';
import { 
  ChevronLeft, 
  Search, 
  BookOpen, 
  CheckCircle2, 
  XCircle,
  Users,
  Filter,
  Check,
  X,
  Plus
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';

export default function StudentSubjectEnrollmentPage() {
  const { selectedSchoolId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ classId?: string }>();
  const classIdFromUrl = params.classId;

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkSelectedStudents, setBulkSelectedStudents] = useState<string[]>([]);
  const [bulkSelectedSubjects, setBulkSelectedSubjects] = useState<string[]>([]);

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => r.schoolId === selectedSchoolId && (r.role === Role.SCHOOL_ADMIN || r.role === Role.ADMIN));

  useEffect(() => {
    if (classIdFromUrl) {
      setSelectedClassId(classIdFromUrl);
    }
  }, [classIdFromUrl]);

  useEffect(() => {
    if (!selectedSchoolId && !classIdFromUrl) {
      navigate('/admin/schools');
      return;
    }
    fetchClasses();
  }, [selectedSchoolId, classIdFromUrl]);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassData();
    } else {
      setStudents([]);
      setSubjects([]);
      setEnrollments([]);
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    if (!selectedSchoolId) return;
    setClasses([]); 
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('school_id', selectedSchoolId)
      .order('name');
      
    if (data) {
      setClasses(mapList(data, mappers.class));
    }
  };

  const fetchClassData = async () => {
    try {
      setLoading(true);
      
      const { data: classSubjects } = await supabase
        .from('class_subject_teachers')
        .select('subject:subjects(*)')
        .eq('class_id', selectedClassId);
      
      const mappedSubjects = (classSubjects || []).map(cs => cs.subject).filter(Boolean) as any[] as Subject[];
      const uniqueSubjects = Array.from(new Map(mappedSubjects.map((s: any) => [s.id, s])).values());
      setSubjects(uniqueSubjects);

      const { data: enrolls } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(*)')
        .eq('class_id', selectedClassId)
        .eq('status', 'ACTIVE');
      
      const mappedStudents = (enrolls || []).map(e => e.student).filter(Boolean);
      
      const uniqueStudents = Array.from(new Map(mappedStudents.map((s: any) => [s.id, s])).values());
      setStudents(uniqueStudents);

      const { data: subEnrolls } = await supabase
        .from('student_subject_enrollments')
        .select('*')
        .eq('class_id', selectedClassId);
      
      setEnrollments(subEnrolls || []);

    } catch (err: any) {
      toast.error('Greška pri učitavanju');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnrollment = async (studentId: string, subjectId: string, currentStatus?: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za mijenjanje upisa.');
      return;
    }
    
    const activeClass = classes.find(c => c.id === selectedClassId);
    const schoolYearId = activeClass?.school_year_id || '';

    if (currentStatus === 'ACTIVE' || currentStatus === 'EXEMPT') {
      try {
        const { error } = await supabase.from('student_subject_enrollments')
          .delete()
          .eq('student_id', studentId)
          .eq('subject_id', subjectId)
          .eq('class_id', selectedClassId)
          .eq('school_year', schoolYearId);

        if (error) throw error;
        toast.success('Predmet uklonjen učeniku');
        setEnrollments(prev => prev.filter(e => !(e.student_id === studentId && e.subject_id === subjectId)));
      } catch (err: any) {
        toast.error('Greška pri uklanjanju upisa: ' + (err.message || 'Nepoznata greška'));
      }
    } else {
      try {
        const { data: existingEnrollment } = await supabase
          .from("student_subject_enrollments")
          .select("id")
          .eq("student_id", studentId)
          .eq("subject_id", subjectId)
          .eq("class_id", selectedClassId)
          .maybeSingle();

        console.log("SAVE STUDENT SUBJECT ENROLLMENT", {
          studentId,
          subjectId,
          classId: selectedClassId,
          existingEnrollmentId: existingEnrollment?.id
        });

        if (existingEnrollment) {
          const { error } = await supabase
            .from("student_subject_enrollments")
            .update({
              status: 'ACTIVE',
              updated_at: new Date().toISOString()
            })
            .eq("id", existingEnrollment.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("student_subject_enrollments")
            .insert({
              student_id: studentId,
              subject_id: subjectId,
              class_id: selectedClassId,
              status: 'ACTIVE',
              school_year: schoolYearId
            });
          if (error) throw error;
        }
        
        toast.success('Sluša predmet');
        setEnrollments(prev => {
          const other = prev.filter(e => !(e.student_id === studentId && e.subject_id === subjectId));
          return [...other, { student_id: studentId, subject_id: subjectId, status: 'ACTIVE' }];
        });
      } catch (err: any) {
        toast.error('Greška pri izmjeni upisa: ' + (err.message || 'Nepoznata greška'));
      }
    }
  };

  const assignAllToSubject = async (subjectId: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za masovni upis.');
      return;
    }
    
    if (!window.confirm('Dodijeli ovaj predmet svim učenicima u razredu?')) return;
    try {
      const activeClass = classes.find(c => c.id === selectedClassId);
      const schoolYearId = activeClass?.school_year_id || '';

      const payload = students.map(s => ({
        student_id: s.id,
        subject_id: subjectId,
        class_id: selectedClassId,
        status: 'ACTIVE',
        school_year: schoolYearId
      }));
      
      const { error } = await supabase.from('student_subject_enrollments').upsert(payload, { onConflict: 'student_id,subject_id,class_id' });
      if (error) throw error;
      
      toast.success('Predmet dodijeljen svima');
      fetchClassData();
    } catch (err: any) {
      toast.error('Masovni upis nije uspio: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const handleBulkAssign = async () => {
    if (bulkSelectedStudents.length === 0 || bulkSelectedSubjects.length === 0) {
      toast.error('Odaberite barem jednog učenika i jedan predmet');
      return;
    }

    try {
      setLoading(true);
      const activeClass = classes.find(c => c.id === selectedClassId);
      const schoolYearId = activeClass?.school_year_id || '';

      const payload: any[] = [];
      bulkSelectedStudents.forEach(stuId => {
        bulkSelectedSubjects.forEach(subId => {
          payload.push({
            student_id: stuId,
            subject_id: subId,
            class_id: selectedClassId,
            status: 'ACTIVE',
            school_year: schoolYearId
          });
        });
      });

      const { error } = await supabase.from('student_subject_enrollments').upsert(payload, { onConflict: 'student_id,subject_id,class_id' });
      if (error) throw error;

      toast.success('Uspješno spremljene kombinacije');
      setIsBulkModalOpen(false);
      setBulkSelectedStudents([]);
      setBulkSelectedSubjects([]);
      fetchClassData();
    } catch (err: any) {
      toast.error('Greška pri masovnom unosu: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const rawFiltered = students.filter(s => 
    matchesSearch(s.name, searchTerm)
  );
  const filteredStudents = sortStudentsBySurname(rawFiltered);

  return (
    <div className="p-6 font-sans w-full">
      <div className="flex justify-between items-end mb-8 border-b-2 border-slate-100 pb-6">
        <div>
          <button 
            onClick={() => navigate(classIdFromUrl ? `/class/${classIdFromUrl}/admin` : '/admin-skole')}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors uppercase font-black text-[9px] tracking-widest mb-4"
          >
            <ChevronLeft size={12} strokeWidth={3} />
            Natrag na pregled
          </button>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Predmeti učenika</h1>
            {selectedClassId && isAnyAdmin && (
              <button 
                onClick={() => {
                  setBulkSelectedStudents([]);
                  setBulkSelectedSubjects([]);
                  setIsBulkModalOpen(true);
                }}
                className="bg-[#005c8d] text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#004a70] mb-2"
              >
                <Plus size={16} /> Dodaj više
              </button>
            )}
          </div>
          <p className="text-slate-500 font-medium text-sm">Pojedinačna i masovna dodjela i oslobađanje učenika od predmeta</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {!classIdFromUrl && (
          <div className="md:col-span-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Odaberi razredni odjel</label>
            <select 
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl p-4 font-bold text-slate-900 outline-none focus:border-[#005c8d] transition-all shadow-sm"
            >
              <option value="">Odaberi razred...</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className={classIdFromUrl ? "md:col-span-4" : "md:col-span-3"}>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Pretraži učenike</label>
          <div className="bg-white border-2 border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <Search size={20} className="text-slate-300" />
            <input 
              type="text" 
              placeholder="Ime učenika..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-900 w-full"
            />
          </div>
        </div>
      </div>

      {!selectedClassId ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Users size={32} className="text-slate-200" />
            </div>
            <p className="font-black text-slate-300 uppercase tracking-widest text-xs">Odaberite razredni odjel za nastavak</p>
        </div>
      ) : loading ? (
        <div className="p-20 text-center animate-pulse font-black uppercase text-slate-300 tracking-widest">Učitavanje podataka...</div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 w-64 border-r sticky left-0 bg-slate-50 z-10">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Učenik</span>
                </th>
                {subjects.map(s => (
                  <th key={s.id} className="p-4 border-r min-w-[120px] group relative">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-900 uppercase leading-none">{formatSubjectName(s)}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{s.code}</span>
                    </div>
                    <button 
                      onClick={() => isAnyAdmin && assignAllToSubject(s.id)}
                      className={`absolute top-2 right-2 bg-slate-100 text-slate-400 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#005c8d] hover:text-white transition-all transform hover:scale-110 ${!isAnyAdmin && 'hidden'}`}
                      title="Dodijeli svima"
                    >
                      <Check size={10} strokeWidth={4} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.map((student, idx) => (
                <tr key={student.id} className="hover:bg-slate-50/50 group">
                  <td className="p-4 border-r font-black text-slate-900 uppercase text-[11px] tracking-tight flex items-center gap-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                    <span className="text-[10px] text-slate-300 w-4">{idx + 1}.</span>
                    {student.name}
                  </td>
                  {subjects.map(subject => {
                    const enrollment = enrollments.find(e => e.student_id === student.id && e.subject_id === subject.id);
                    const isActive = enrollment?.status === 'ACTIVE';
                    const isExempt = enrollment?.status === 'EXEMPT';
                    
                    return (
                      <td key={subject.id} className="p-4 border-r text-center">
                        <button 
                          onClick={() => toggleEnrollment(student.id, subject.id, enrollment?.status)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm mx-auto ${
                            isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                            'bg-slate-50 text-slate-300 border border-slate-100 grayscale opacity-40 hover:grayscale-0 hover:opacity-100'
                          }`}
                        >
                          {isActive ? <CheckCircle2 size={20} /> : <div className="w-4 h-4 border-2 border-slate-300 rounded-sm" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <div className="p-20 text-center text-slate-300 font-bold uppercase text-xs tracking-widest">
              Nema učenika u ovom razredu
            </div>
          )}
        </div>
      )}

      {selectedClassId && !loading && subjects.length === 0 && (
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-8 flex items-center gap-4 text-amber-800">
           <BookOpen size={24} />
           <div>
             <p className="font-black uppercase text-xs tracking-widest mb-1">Ovaj razred nema dodijeljenih predmeta</p>
             <p className="text-[11px] font-bold">Prvo dodijelite predmete razredu u sekciji <button onClick={() => navigate(`/admin/razred-predmeti?classId=${selectedClassId}`)} className="underline">Predmeti razreda</button>.</p>
           </div>
        </div>
      )}

      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800 uppercase">Dodaj više (Masovni upis)</h2>
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 bg-white shadow-sm rounded-full p-2"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-2 gap-8 bg-slate-50/50">
              {/* Učenici */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4 border-b pb-4">
                  <h3 className="font-black text-slate-700 text-sm uppercase">Odaberi učenike</h3>
                  <button 
                    onClick={() => {
                      if (bulkSelectedStudents.length === students.length) setBulkSelectedStudents([]);
                      else setBulkSelectedStudents(students.map(s => s.id));
                    }}
                    className="text-[10px] font-bold text-[#005c8d] underline"
                  >
                    Odaberi sve
                  </button>
                </div>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                  {students.map(s => {
                    const isChecked = bulkSelectedStudents.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer rounded-lg transition-colors border border-transparent hover:border-slate-100 group">
                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors \${isChecked ? 'bg-[#005c8d] border-[#005c8d]' : 'border-slate-300 group-hover:border-slate-400'}`}>
                          {isChecked && <Check size={14} className="text-white" strokeWidth={3} />}
                        </div>
                        <span className="text-sm font-bold text-slate-700">{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Predmeti */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4 border-b pb-4">
                  <h3 className="font-black text-slate-700 text-sm uppercase">Odaberi predmete</h3>
                  <button 
                    onClick={() => {
                      if (bulkSelectedSubjects.length === subjects.length) setBulkSelectedSubjects([]);
                      else setBulkSelectedSubjects(subjects.map(s => s.id));
                    }}
                    className="text-[10px] font-bold text-[#005c8d] underline"
                  >
                    Odaberi sve
                  </button>
                </div>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                  {subjects.map(sub => {
                    const isChecked = bulkSelectedSubjects.includes(sub.id);
                    return (
                      <label key={sub.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer rounded-lg transition-colors border border-transparent hover:border-slate-100 group">
                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors \${isChecked ? 'bg-[#005c8d] border-[#005c8d]' : 'border-slate-300 group-hover:border-slate-400'}`}>
                          {isChecked && <Check size={14} className="text-white" strokeWidth={3} />}
                        </div>
                        <span className="text-sm font-bold text-slate-700">{formatSubjectName(sub)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3">
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                disabled={loading}
              >
                Odustani
              </button>
              <button 
                onClick={handleBulkAssign}
                disabled={loading}
                className="bg-[#005c8d] hover:bg-[#004a70] text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Spremanje...' : 'Spremi kombinacije'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
