import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  ArrowLeft, 
  RefreshCw, 
  CheckCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Users,
  Building,
  ChevronRight,
  FileText
} from 'lucide-react';

interface SchoolYearDB {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  status: string;
}

interface ClassDB {
  id: string;
  name: string;
  grade_level: number;
  section: string;
  homeroom_teacher_id: string | null;
  deputy_teacher_id: string | null;
  program_id: string | null;
  school_year: string;
}

interface RolloverKCandidate {
  enrollment_id: string;
  student_id: string;
  class_id: string;
  class_name: string;
  program_id: string | null;
  name: string;
  email?: string | null;
}

export default function RolloverPage() {
  const { selectedSchoolId } = useSelection();
  const { user, userSchoolRoles } = useAuth();
  const navigate = useNavigate();

  // Resolve active schoolId
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

  const [schoolYears, setSchoolYears] = useState<SchoolYearDB[]>([]);
  const [classes, setClasses] = useState<ClassDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Rollover settings wizard states
  const [fromYearId, setFromYearId] = useState('');
  const [toYearId, setToYearId] = useState('');
  const [copyTeachers, setCopyTeachers] = useState(true);
  const [copyPrograms, setCopyPrograms] = useState(true);
  const [createFirstGrades, setCreateFirstGrades] = useState(true);
  const [firstGradeCount, setFirstGradeCount] = useState(3);
  const [kCandidates, setKCandidates] = useState<RolloverKCandidate[]>([]);
  const [selectedKStudentIds, setSelectedKStudentIds] = useState<string[]>([]);
  const [loadingKCandidates, setLoadingKCandidates] = useState(false);

  // Summary / Result logs screen
  const [rolloverResult, setRolloverResult] = useState<{
    success: boolean;
    classesCreated: number;
    studentsTransferred: number;
    logs: string[];
  } | null>(null);

  useEffect(() => {
    if (schoolId) {
      fetchYears();
    } else {
      setLoading(false);
    }
  }, [schoolId]);

  const fetchYears = async () => {
    if (!schoolId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('school_years')
        .select('*')
        .eq('school_id', schoolId)
        .order('starts_at', { ascending: false });

      if (error) throw error;
      const years = data || [];
      setSchoolYears(years);

      // Pre-set from/to years intuitively
      if (years.length >= 2) {
        setFromYearId(years[1].id);
        setToYearId(years[0].id);
      } else if (years.length === 1) {
        setFromYearId(years[0].id);
      }
    } catch (err: any) {
      toast.error('Greška pri učitavanju školskih godina: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch classes when from year changes
  useEffect(() => {
    if (fromYearId) {
      fetchSourceClasses();
    } else {
      setClasses([]);
    }
  }, [fromYearId]);

  useEffect(() => {
    if (fromYearId && toYearId && schoolId) {
      fetchKCandidates();
    } else {
      setKCandidates([]);
      setSelectedKStudentIds([]);
    }
  }, [fromYearId, toYearId, schoolId]);

  const fetchSourceClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('school_year_id', fromYearId)
        .order('grade_level')
        .order('name');

      if (error) throw error;
      setClasses(data || []);
    } catch (err: any) {
      console.error('fetchSourceClasses error', err);
    }
  };

  // Calculate target class outcome for a given source class
  const getTargetClassOutcome = (cls: ClassDB) => {
    const name = cls.name.trim().toUpperCase();
    let toClassName = '';
    let finishes = false;
    let nextGradeLevel = cls.grade_level + 1;

    if (name === '1.A') toClassName = '2.A';
    else if (name === '2.A') toClassName = '3.A';
    else if (name === '3.A' || name === '3.B') finishes = true;
    else if (name === '3.C') toClassName = '4.C';
    else if (name === '3.D') toClassName = '4.D';
    else if (name === '4.K') toClassName = '4.I';
    else if (cls.grade_level >= 4) {
      finishes = true;
    } else {
      toClassName = cls.name.replace(cls.grade_level.toString(), nextGradeLevel.toString());
    }

    return {
      toClassName,
      finishes,
      nextGradeLevel
    };
  };

  const ensureTargetClass = async (
    existingClassesMap: Map<string, ClassDB>,
    toYearName: string,
    name: string,
    gradeLevel: number,
    section: string,
    extra: Partial<ClassDB> = {}
  ) => {
    const targetName = name.trim().toUpperCase();
    const existing = existingClassesMap.get(targetName);
    if (existing) return { classRow: existing, created: false };

    const { data, error } = await supabase
      .from('classes')
      .insert({
        school_id: schoolId,
        school_year_id: toYearId,
        school_year: toYearName,
        name,
        grade_level: gradeLevel,
        section,
        homeroom_teacher_id: extra.homeroom_teacher_id ?? null,
        deputy_teacher_id: extra.deputy_teacher_id ?? null,
        program_id: extra.program_id ?? null,
        status: 'ACTIVE'
      })
      .select()
      .single();

    if (error) throw error;
    existingClassesMap.set(targetName, data);
    return { classRow: data as ClassDB, created: true };
  };

  const fetchKCandidates = async () => {
    if (!schoolId || !fromYearId) return;
    try {
      setLoadingKCandidates(true);
      const { data: sourceClasses, error: classError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('school_year_id', fromYearId)
        .in('name', ['3.A', '3.B']);
      if (classError) throw classError;

      const classRows = sourceClasses || [];
      const classIds = classRows.map((cls: any) => cls.id);
      if (classIds.length === 0) {
        setKCandidates([]);
        setSelectedKStudentIds([]);
        return;
      }

      const { data: enrollments, error: enrollmentError } = await supabase
        .from('student_class_enrollments')
        .select('id, student_id, class_id, program_id')
        .in('class_id', classIds)
        .eq('status', 'ACTIVE');
      if (enrollmentError) throw enrollmentError;

      const studentIds = Array.from(new Set((enrollments || []).map((item: any) => item.student_id).filter(Boolean)));
      const { data: profiles, error: profileError } = studentIds.length > 0
        ? await supabase.from('user_profiles').select('id, name, email').in('id', studentIds)
        : { data: [], error: null };
      if (profileError) throw profileError;

      const classNameById = new Map(classRows.map((cls: any) => [cls.id, cls.name]));
      const profileById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
      setKCandidates((enrollments || []).map((enrollment: any) => {
        const profile = profileById.get(enrollment.student_id) as any;
        return {
          enrollment_id: enrollment.id,
          student_id: enrollment.student_id,
          class_id: enrollment.class_id,
          class_name: String(classNameById.get(enrollment.class_id) || ''),
          program_id: enrollment.program_id || null,
          name: profile?.name || enrollment.student_id,
          email: profile?.email || null,
        };
      }));
      setSelectedKStudentIds([]);
    } catch (err: any) {
      console.error('fetchKCandidates error', err);
      toast.error('Nije moguće učitati učenike za 4.K.');
    } finally {
      setLoadingKCandidates(false);
    }
  };

  const handleEnrollSelectedIn4K = async () => {
    if (!schoolId || !fromYearId || !toYearId || selectedKStudentIds.length === 0) return;
    const toYearName = schoolYears.find(y => y.id === toYearId)?.name || '';
    try {
      setProcessing(true);
      const { data: targetClasses, error: targetError } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('school_year_id', toYearId);
      if (targetError) throw targetError;

      const existingClassesMap = new Map<string, ClassDB>();
      (targetClasses || []).forEach((cls: ClassDB) => existingClassesMap.set(cls.name.trim().toUpperCase(), cls));
      const { classRow: class4K } = await ensureTargetClass(existingClassesMap, toYearName, '4.K', 4, 'K');
      const selectedCandidates = kCandidates.filter(candidate => selectedKStudentIds.includes(candidate.student_id));

      const { error } = await supabase
        .from('student_class_enrollments')
        .upsert(selectedCandidates.map(candidate => ({
          student_id: candidate.student_id,
          class_id: class4K.id,
          school_year_id: toYearId,
          school_year: toYearName,
          program_id: candidate.program_id,
          status: 'ACTIVE'
        })), { onConflict: 'student_id,class_id,school_year' });
      if (error) throw error;

      toast.success(`U 4.K upisano učenika: ${selectedCandidates.length}`);
      setSelectedKStudentIds([]);
      await fetchKCandidates();
    } catch (err: any) {
      toast.error('Upis u 4.K nije uspio: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRunRollover = async () => {
    if (!schoolId) return;
    if (!fromYearId || !toYearId) {
      toast.error('Odaberite polaznu i odredišnu školsku godinu.');
      return;
    }
    if (fromYearId === toYearId) {
      toast.error('Polazna i odredišna godina moraju biti različite.');
      return;
    }

    const fromYearName = schoolYears.find(y => y.id === fromYearId)?.name || '';
    const toYearName = schoolYears.find(y => y.id === toYearId)?.name || '';

    if (!window.confirm(`OPREZ! Pokrećete cjeloviti rollover iz školske godine ${fromYearName} u ${toYearName}. Ova akcija će automatski premjestiti sve aktivne učenike i kreirati naprednije razrede. Jeste li sigurni?`)) {
      return;
    }

    try {
      setProcessing(true);
      const executionLogs: string[] = [];
      let classesCreatedCount = 0;
      let studentsTransferredCount = 0;

      executionLogs.push(`Započinjanje prijenosa školske godine: ${fromYearName} -> ${toYearName}`);

      // 1. Fetch target classes to check if already present
      const { data: targetClasses, error: tcError } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('school_year_id', toYearId);
      if (tcError) throw tcError;

      const existingClassesMap = new Map<string, ClassDB>();
      targetClasses?.forEach(tc => {
        existingClassesMap.set(tc.name.trim().toUpperCase(), tc);
      });

      try {
        const ensured4K = await ensureTargetClass(existingClassesMap, toYearName, '4.K', 4, 'K');
        if (ensured4K.created) {
          classesCreatedCount++;
          executionLogs.push('Kreiran prazan razlikovni razred: 4.K');
        } else {
          executionLogs.push('Razlikovni razred 4.K već postoji, preskačem kreiranje.');
        }
      } catch (ce: any) {
        executionLogs.push(`Upozorenje: nije moguće stvoriti 4.K: ${ce.message}`);
      }

      // 2. Auto-generate Grade 1 classes if requested
      if (createFirstGrades) {
        const count = Math.max(0, Math.min(26, Math.floor(firstGradeCount || 0)));
        const defaultFirsts = Array.from({ length: count }, (_, index) => `1.${String.fromCharCode(65 + index)}`);
        for (const first of defaultFirsts) {
          if (!existingClassesMap.has(first)) {
            const { data: nc, error: ce } = await supabase
              .from('classes')
              .insert({
                school_id: schoolId,
                school_year_id: toYearId,
                school_year: toYearName,
                name: first,
                grade_level: 1,
                section: first.replace('1.', ''),
                status: 'ACTIVE'
              })
              .select()
              .single();

            if (ce) {
              executionLogs.push(`Upozorenje: nije moguće stvoriti prvi razred ${first}: ${ce.message}`);
            } else if (nc) {
              existingClassesMap.set(first, nc);
              classesCreatedCount++;
              executionLogs.push(`Kreiran novi prvi razred: ${first}`);
            }
          } else {
            executionLogs.push(`Prvi razred ${first} već postoji, preskačem kreiranje.`);
          }
        }
      }

      // 3. Process every source class rollover
      for (const sourceClass of classes) {
        const outcome = getTargetClassOutcome(sourceClass);

        if (outcome.finishes) {
          executionLogs.push(`Razred ${sourceClass.name} završava školovanje. Učenici neće biti premješteni u novi razred, već će biti diplomirani/arhivirani.`);
          
          // Get students in this graduating class and mark their status or log
          const { data: gradStudents } = await supabase
            .from('student_class_enrollments')
            .select(`
              id,
              student_id
            `)
            .eq('class_id', sourceClass.id)
            .eq('status', 'ACTIVE');

          if (gradStudents && gradStudents.length > 0) {
            executionLogs.push(`Diplomirano ukupno ${gradStudents.length} učenika iz razreda ${sourceClass.name}.`);
            
            // Mark enrollments as archived
            await supabase
              .from('student_class_enrollments')
              .update({ status: 'ARCHIVED' })
              .eq('class_id', sourceClass.id);
          }
          continue;
        }

        // Target class needs to exist or be created
        const targetName = outcome.toClassName.trim().toUpperCase();
        let targetClass = existingClassesMap.get(targetName);

        if (!targetClass) {
          // Creating target class
          const { data: createdC, error: crError } = await supabase
            .from('classes')
            .insert({
              school_id: schoolId,
              school_year_id: toYearId,
              school_year: toYearName,
              name: outcome.toClassName,
              grade_level: outcome.nextGradeLevel,
              section: sourceClass.section,
              homeroom_teacher_id: copyTeachers ? sourceClass.homeroom_teacher_id : null,
              deputy_teacher_id: copyTeachers ? sourceClass.deputy_teacher_id : null,
              program_id: copyPrograms ? sourceClass.program_id : null,
              status: 'ACTIVE'
            })
            .select()
            .single();

          if (crError) {
            executionLogs.push(`Pogreška pri stvaranju razreda ${outcome.toClassName}: ${crError.message}`);
            continue;
          }

          targetClass = createdC;
          existingClassesMap.set(targetName, targetClass!);
          classesCreatedCount++;
          executionLogs.push(`Kreiran novi viši razred ${outcome.toClassName} (iz ${sourceClass.name})`);
        } else {
          executionLogs.push(`Razred ${outcome.toClassName} već postoji u odredišnoj godini. Spajam učenike.`);
        }

        // Fetch students of the source class
        const { data: studentsToMove, error: studError } = await supabase
          .from('student_class_enrollments')
          .select(`
            id,
            student_id,
            program_id
          `)
          .eq('class_id', sourceClass.id)
          .eq('status', 'ACTIVE');

        if (studError) {
          executionLogs.push(`Pogreška pri čitanju učenika za razred ${sourceClass.name}: ${studError.message}`);
          continue;
        }

        if (studentsToMove && studentsToMove.length > 0) {
          for (const se of studentsToMove) {
            // Upsert student class enrollment in the new year
            const { error: upsError } = await supabase
              .from('student_class_enrollments')
              .upsert({
                student_id: se.student_id,
                class_id: targetClass!.id,
                school_year_id: toYearId,
                school_year: toYearName,
                program_id: se.program_id || targetClass!.program_id,
                status: 'ACTIVE'
              }, { onConflict: 'student_id,class_id,school_year' });

            if (upsError) {
              executionLogs.push(`Upozorenje: neuspjelo prebacivanje učenika ID ${se.student_id}: ${upsError.message}`);
            } else {
              studentsTransferredCount++;
            }
          }
          executionLogs.push(`Uspješno prebačeno ${studentsToMove.length} učenika iz ${sourceClass.name} u ${outcome.toClassName}`);
        }

        // Insert rollover_logs history
        await supabase
          .from('rollover_logs')
          .insert({
            school_id: schoolId,
            from_school_year_id: fromYearId,
            to_school_year_id: toYearId,
            from_class_id: sourceClass.id,
            to_class_id: targetClass!.id,
            students_transferred: studentsToMove?.length || 0
          });
      }

      executionLogs.push(`Rollover uspješno završen! Kreirano razreda: ${classesCreatedCount}, prebačeno učenika: ${studentsTransferredCount}`);
      
      setRolloverResult({
        success: true,
        classesCreated: classesCreatedCount,
        studentsTransferred: studentsTransferredCount,
        logs: executionLogs
      });
      toast.success('Prijenos školske godine je uspješno završen.');
    } catch (err: any) {
      toast.error('Pogreška pri izvršavanju prijenosa: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 font-sans bg-[#f8f9fa] min-h-screen">
      <div className="max-w-4xl mx-auto">
        
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-[#dee2e6] pb-6">
          <div>
            <div className="flex items-center gap-2 text-[#005c8d] text-xs font-black uppercase tracking-widest mb-2 cursor-pointer hover:underline" onClick={() => navigate('/admin-skole')}>
              <ArrowLeft size={14} /> Natrag u administraciju
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Prijenos / Rollover</h1>
            <p className="text-slate-500 font-medium text-sm">Masovni prijenos razrednih odjela i učenika u novu školsku godinu</p>
          </div>
        </div>

        {/* Wizard Panel */}
        {loading ? (
          <div className="flex justify-center py-20 text-[#005c8d]">
            <RefreshCw size={40} className="animate-spin" />
          </div>
        ) : !schoolId ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 text-center rounded-sm font-bold">
            Greška: Odaberite aktivnu školu najprije na popisu škola.
          </div>
        ) : rolloverResult ? (
          /* Results Layout */
          <div className="bg-white border border-[#dee2e6] rounded-sm p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 text-green-700 border-b pb-4">
              <CheckCircle size={32} />
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Prijenos godine uspješno obavljen</h3>
                <p className="text-xs text-slate-500">Svi razredni odjeli i učenici su uspješno mapirani u novu godinu.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 border rounded-sm text-center">
                <span className="block text-2xl font-black text-slate-800">{rolloverResult.classesCreated}</span>
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Kreirano razreda</span>
              </div>
              <div className="bg-slate-50 p-4 border rounded-sm text-center">
                <span className="block text-2xl font-black text-slate-800">{rolloverResult.studentsTransferred}</span>
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Prebačeno učenika</span>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText size={12} /> Detaljni dnevnik operacija
              </h4>
              <div className="bg-slate-900 text-slate-300 font-mono text-[10px] p-4 rounded-sm max-h-60 overflow-y-auto space-y-1 leading-normal">
                {rolloverResult.logs.map((log, index) => (
                  <div key={index} className="border-b border-slate-800/45 pb-1">
                    <span className="text-slate-500">[{index + 1}]</span> {log}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 flex gap-4">
              <button
                onClick={() => setRolloverResult(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-center py-3 rounded-sm font-black uppercase tracking-wider text-[10px] cursor-pointer"
              >
                Vrati se na čarobnjak
              </button>
              <button
                onClick={() => navigate('/admin-skole')}
                className="flex-1 bg-[#005c8d] hover:bg-[#004a71] text-white text-center py-3 rounded-sm font-black uppercase tracking-wider text-[10px] cursor-pointer shadow-md"
              >
                Završi i izađi
              </button>
            </div>
          </div>
        ) : (
          /* Wizard settings form */
          <div className="space-y-6">
            
            <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 text-xs text-amber-800 flex gap-3 items-start">
              <AlertTriangle size={18} className="shrink-0 text-amber-700 mt-0.5 animate-bounce" />
              <div>
                <span className="font-bold uppercase tracking-wider block mb-1">Kritična operacija prijenosa</span>
                Ova se funkcija koristi na kraju nastavne godine kako bi se učenici prebacili u viši razred. Prije pokretanja provjerite jeste li kreirali i definirali novu školsku godinu (npr. 2026./2027.) s ispravnim rasponom datuma.
              </div>
            </div>

            <div className="bg-white border border-[#dee2e6] rounded-sm p-6 shadow-sm space-y-6">
              
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight border-b pb-3 mb-4">Opcije prijenosa godine</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Izvorna školska godina (Iz koje prenosimo)</label>
                  <select
                    value={fromYearId}
                    onChange={e => setFromYearId(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    required
                  >
                    <option value="">— Odaberite godinu —</option>
                    {schoolYears.map(sy => (
                      <option key={sy.id} value={sy.id}>{sy.name} ({sy.status})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Nova školska godina (U koju prenosimo)</label>
                  <select
                    value={toYearId}
                    onChange={e => setToYearId(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    required
                  >
                    <option value="">— Odaberite godinu —</option>
                    {schoolYears.map(sy => (
                      <option key={sy.id} value={sy.id}>{sy.name} ({sy.status})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-4 border-t">
                <label className="flex items-center gap-3 cursor-pointer py-1.5">
                  <input
                    type="checkbox"
                    checked={copyTeachers}
                    onChange={e => setCopyTeachers(e.target.checked)}
                    className="rounded-sm text-[#005c8d] focus:ring-[#005c8d] w-4 h-4 accent-[#005c8d]"
                  />
                  <div>
                    <span className="block text-xs font-extrabold text-slate-800 uppercase tracking-tight">Kopiraj razrednike i zamjenike</span>
                    <span className="block text-[10px] text-slate-400">Postavit će iste nastavnike na novostvorene razrede na temelju izvorne godine.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer py-1.5">
                  <input
                    type="checkbox"
                    checked={copyPrograms}
                    onChange={e => setCopyPrograms(e.target.checked)}
                    className="rounded-sm text-[#005c8d] focus:ring-[#005c8d] w-4 h-4 accent-[#005c8d]"
                  />
                  <div>
                    <span className="block text-xs font-extrabold text-slate-800 uppercase tracking-tight">Poveži obrazovne programe/smjerove</span>
                    <span className="block text-[10px] text-slate-400">Automatski će dodijeliti iste smjerove novonastalim razrednim odjelima.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer py-1.5">
                  <input
                    type="checkbox"
                    checked={createFirstGrades}
                    onChange={e => setCreateFirstGrades(e.target.checked)}
                    className="rounded-sm text-[#005c8d] focus:ring-[#005c8d] w-4 h-4 accent-[#005c8d]"
                  />
                  <div>
                    <span className="block text-xs font-extrabold text-slate-800 uppercase tracking-tight">Automatski stvori prve razrede</span>
                    <span className="block text-[10px] text-slate-400">Kreirat će prazne odjele prvih razreda spremne za nove prvašiće.</span>
                  </div>
                </label>
                {createFirstGrades && (
                  <div className="pl-7 max-w-xs">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Broj novih prvih razreda</label>
                    <input
                      type="number"
                      min={0}
                      max={26}
                      value={firstGradeCount}
                      onChange={e => setFirstGradeCount(Number(e.target.value))}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">
                      Primjer: 3 automatski stvara 1.A, 1.B i 1.C.
                    </div>
                  </div>
                )}
              </div>

              {/* Preview target simulation cards */}
              {classes.length > 0 && (
                <div className="pt-6 border-t space-y-3">
                  <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Simulacijski pregled mapiranja razreda:</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                    {classes.map(cls => {
                      const outcome = getTargetClassOutcome(cls);
                      return (
                        <div key={cls.id} className="bg-slate-50 border p-3 rounded-sm flex items-center justify-between text-xs font-bold text-slate-700">
                          <span>{cls.name}</span>
                          <ArrowRight size={14} className="text-slate-400" />
                          {outcome.finishes ? (
                            <span className="text-[9px] bg-amber-100 text-amber-800 py-0.5 px-1.5 rounded">ZAVRŠAVA</span>
                          ) : (
                            <span className="text-blue-700 bg-blue-50 py-0.5 px-1.5 rounded">{outcome.toClassName}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Ručno upisivanje učenika u 4.K</h4>
                    <p className="text-[10px] text-slate-400 mt-1">Prikazani su učenici iz 3.A i 3.B iz izvorne godine. Odabrane učenike možete upisati u razlikovni 4.K nove godine.</p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchKCandidates}
                    className="text-[10px] font-black uppercase tracking-wider text-[#005c8d] hover:underline"
                  >
                    Osvježi popis
                  </button>
                </div>

                <div className="border border-slate-200 rounded-sm max-h-60 overflow-auto bg-white">
                  {loadingKCandidates ? (
                    <div className="p-6 text-center text-xs text-slate-400 italic">Učitavanje učenika...</div>
                  ) : kCandidates.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 italic">Nema aktivnih učenika u 3.A i 3.B za odabranu izvornu godinu.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider sticky top-0">
                        <tr>
                          <th className="p-2 text-left w-10">
                            <input
                              type="checkbox"
                              checked={selectedKStudentIds.length === kCandidates.length}
                              onChange={e => setSelectedKStudentIds(e.target.checked ? kCandidates.map(candidate => candidate.student_id) : [])}
                              className="accent-[#005c8d]"
                            />
                          </th>
                          <th className="p-2 text-left">Učenik</th>
                          <th className="p-2 text-left">Izvorni razred</th>
                          <th className="p-2 text-left">E-mail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kCandidates.map(candidate => (
                          <tr key={candidate.enrollment_id} className="border-t border-slate-100">
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={selectedKStudentIds.includes(candidate.student_id)}
                                onChange={e => {
                                  setSelectedKStudentIds(current => e.target.checked
                                    ? [...current, candidate.student_id]
                                    : current.filter(id => id !== candidate.student_id)
                                  );
                                }}
                                className="accent-[#005c8d]"
                              />
                            </td>
                            <td className="p-2 font-bold text-slate-800">{candidate.name}</td>
                            <td className="p-2 text-slate-600">{candidate.class_name}</td>
                            <td className="p-2 text-slate-500">{candidate.email || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <button
                  type="button"
                  disabled={processing || selectedKStudentIds.length === 0}
                  onClick={handleEnrollSelectedIn4K}
                  className={`px-4 py-3 rounded-sm text-[10px] font-black uppercase tracking-wider text-white ${processing || selectedKStudentIds.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#005c8d] hover:bg-[#004a71]'}`}
                >
                  Upiši odabrane u 4.K
                </button>
              </div>

              <div className="pt-6 border-t border-[#dee2e6]">
                <button
                  type="button"
                  disabled={processing || classes.length === 0}
                  onClick={handleRunRollover}
                  className={`w-full py-4 text-center text-white font-black uppercase tracking-wider text-[11px] rounded-sm shadow-md transition-all ${processing || classes.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-98 cursor-pointer'}`}
                >
                  {processing ? 'Izvršavam prijenos, pričekajte...' : 'Pokreni prijenos godine (Rollover)'}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
