import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { sortStudentsBySurname } from '../../lib/utils';
import { logSystemAction } from '../../utils/auditLogger';
import { toast } from 'react-hot-toast';
import {
  ArrowRightLeft,
  Building2,
  GraduationCap,
  Loader2,
  Search,
  ShieldAlert,
  UserRoundCheck,
  UserRoundMinus,
} from 'lucide-react';

interface StudentItem {
  id: string;
  name: string;
  surname?: string;
  email?: string;
  status: string;
  roleId: string;
  classId?: string;
  className?: string;
  schoolYear?: string;
  enrollmentId?: string;
}

interface ClassItem {
  id: string;
  name: string;
  school_year: string;
  school_year_id: string;
  program_id?: string | null;
}

interface RegistrationItem {
  id: string;
  student_id: string;
  action_type: string;
  date: string;
  reason?: string;
  former_class_name?: string;
  new_class_name?: string;
  other_school_name?: string;
}

type TransferMode =
  | 'INTERNAL_TRANSFER'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'DROPOUT'
  | 'GRADUATION'
  | 'REACTIVATE';

function resolveSchoolId(
  selectedSchoolId: string | null,
  user: any,
  userSchoolRoles: Array<{ schoolId: string }> = [],
) {
  if (selectedSchoolId) return selectedSchoolId;
  if (user?.school_id) return user.school_id;
  if (user?.schoolId) return user.schoolId;
  if (userSchoolRoles.length > 0) return userSchoolRoles[0].schoolId;
  if (user?.roles?.length > 0) return user.roles[0].school_id || user.roles[0].schoolId;
  return '';
}

function getModeMeta(mode: TransferMode) {
  switch (mode) {
    case 'INTERNAL_TRANSFER':
      return { label: 'Interni premještaj', actionType: 'PREMJESTAJ', nextStatus: 'ACTIVE' };
    case 'TRANSFER_OUT':
      return { label: 'Prijelaz u drugu školu', actionType: 'PRIJELAZ_U', nextStatus: 'TRANSFERRED' };
    case 'TRANSFER_IN':
      return { label: 'Prijelaz iz druge škole', actionType: 'PRIJELAZ_IZ', nextStatus: 'ACTIVE' };
    case 'DROPOUT':
      return { label: 'Ispis / odustao', actionType: 'ISPIS', nextStatus: 'DROPPED_OUT' };
    case 'GRADUATION':
      return { label: 'Završio školovanje', actionType: 'ISPIS', nextStatus: 'GRADUATED' };
    case 'REACTIVATE':
      return { label: 'Ponovni upis', actionType: 'UPIS', nextStatus: 'ACTIVE' };
    default:
      return { label: mode, actionType: 'PREMJESTAJ', nextStatus: 'ACTIVE' };
  }
}

function statusBadge(status: string) {
  const upper = (status || '').toUpperCase();
  if (upper === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (upper === 'GRADUATED') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (upper === 'TRANSFERRED') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (upper === 'DROPPED_OUT') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

export default function StudentTransfersPage() {
  const { selectedSchoolId } = useSelection();
  const { user, userSchoolRoles } = useAuth();
  const schoolId = resolveSchoolId(selectedSchoolId, user, userSchoolRoles);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [history, setHistory] = useState<RegistrationItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [mode, setMode] = useState<TransferMode>('INTERNAL_TRANSFER');
  const [targetClassId, setTargetClassId] = useState('');
  const [otherSchoolName, setOtherSchoolName] = useState('');
  const [reason, setReason] = useState('');

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId],
  );

  const selectedHistory = useMemo(
    () => history.filter((item) => item.student_id === selectedStudentId),
    [history, selectedStudentId],
  );

  const fetchData = async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [{ data: classData, error: classError }, { data: roleRows, error: roleError }, { data: enrollmentRows, error: enrollmentError }] =
        await Promise.all([
          supabase
            .from('classes')
            .select('id, name, school_year, school_year_id, program_id')
            .eq('school_id', schoolId)
            .order('grade_level')
            .order('name'),
          supabase
            .from('user_school_roles')
            .select('id, user_id, status, user:user_profiles(id, name, surname, email)')
            .eq('school_id', schoolId)
            .eq('role', 'STUDENT'),
          supabase
            .from('student_class_enrollments')
            .select('id, student_id, class_id, school_year, status')
            .order('created_at', { ascending: false }),
        ]);

      if (classError) throw classError;
      if (roleError) throw roleError;
      if (enrollmentError) throw enrollmentError;

      const historyResponse = await fetch(`/api/student-registrations?schoolId=${encodeURIComponent(schoolId)}`);
      const historyData = historyResponse.ok ? await historyResponse.json() : [];

      const classMap = new Map((classData || []).map((cls: any) => [cls.id, cls]));
      const activeEnrollmentMap = new Map<string, any>();

      (enrollmentRows || []).forEach((enrollment: any) => {
        const existing = activeEnrollmentMap.get(enrollment.student_id);
        if (!existing || enrollment.status === 'ACTIVE') {
          activeEnrollmentMap.set(enrollment.student_id, enrollment);
        }
      });

      const mapped = (roleRows || []).map((roleRow: any) => {
        const profile = Array.isArray(roleRow.user) ? roleRow.user[0] : roleRow.user;
        const enrollment = activeEnrollmentMap.get(roleRow.user_id);
        const cls = enrollment?.class_id ? classMap.get(enrollment.class_id) : null;

        return {
          id: profile?.id || roleRow.user_id,
          name: profile?.name || '',
          surname: profile?.surname || '',
          email: profile?.email || '',
          status: roleRow.status || 'ACTIVE',
          roleId: roleRow.id,
          classId: enrollment?.class_id || undefined,
          className: cls?.name || 'Neraspoređen',
          schoolYear: enrollment?.school_year || cls?.school_year || '',
          enrollmentId: enrollment?.id,
        } satisfies StudentItem;
      });

      const sorted = sortStudentsBySurname(mapped);
      setStudents(sorted);
      setClasses((classData as ClassItem[]) || []);
      setHistory(Array.isArray(historyData) ? historyData : []);

      if (!selectedStudentId && sorted.length > 0) {
        setSelectedStudentId(sorted[0].id);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Ne mogu učitati premještaje učenika.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [schoolId]);

  useEffect(() => {
    setTargetClassId('');
    setOtherSchoolName('');
    setReason('');
  }, [mode, selectedStudentId]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        [student.name, student.surname, student.email, student.className]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'ALL' || student.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [students, searchTerm, statusFilter]);

  const eligibleClasses = useMemo(() => {
    if (!selectedStudent?.schoolYear) return classes;
    return classes.filter((item) => item.id !== selectedStudent.classId);
  }, [classes, selectedStudent]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent || !schoolId || !user?.id) return;

    const meta = getModeMeta(mode);
    const targetClass = targetClassId ? classes.find((cls) => cls.id === targetClassId) : null;

    if (['INTERNAL_TRANSFER', 'TRANSFER_IN', 'REACTIVATE'].includes(mode) && !targetClass) {
      toast.error('Odaberi ciljni razred.');
      return;
    }

    if (['TRANSFER_OUT', 'TRANSFER_IN'].includes(mode) && !otherSchoolName.trim()) {
      toast.error('Unesi naziv druge škole.');
      return;
    }

    if (!reason.trim()) {
      toast.error('Upiši službeni razlog promjene.');
      return;
    }

    try {
      setSaving(true);

      const { data: activeEnrollments, error: activeEnrollmentsError } = await supabase
        .from('student_class_enrollments')
        .select('id, class_id')
        .eq('student_id', selectedStudent.id)
        .eq('status', 'ACTIVE');

      if (activeEnrollmentsError) throw activeEnrollmentsError;

      const currentClassName = selectedStudent.className || 'Neraspoređen';

      if (mode === 'INTERNAL_TRANSFER') {
        if ((activeEnrollments || []).length > 0) {
          const { error } = await supabase
            .from('student_class_enrollments')
            .update({ status: 'TRANSFERRED' })
            .in('id', activeEnrollments.map((row: any) => row.id));
          if (error) throw error;
        }

        const { error } = await supabase.from('student_class_enrollments').upsert(
          {
            student_id: selectedStudent.id,
            class_id: targetClass!.id,
            school_year_id: targetClass!.school_year_id,
            school_year: targetClass!.school_year,
            program_id: targetClass!.program_id || null,
            status: 'ACTIVE',
          },
          { onConflict: 'student_id,class_id,school_year' },
        );
        if (error) throw error;
      }

      if (mode === 'TRANSFER_OUT' || mode === 'DROPOUT' || mode === 'GRADUATION') {
        if ((activeEnrollments || []).length > 0) {
          const terminalStatus =
            mode === 'GRADUATION' ? 'GRADUATED' : mode === 'DROPOUT' ? 'DROPPED_OUT' : 'TRANSFERRED';
          const { error } = await supabase
            .from('student_class_enrollments')
            .update({ status: terminalStatus })
            .in('id', activeEnrollments.map((row: any) => row.id));
          if (error) throw error;
        }
      }

      if (mode === 'TRANSFER_IN' || mode === 'REACTIVATE') {
        const { error } = await supabase.from('student_class_enrollments').upsert(
          {
            student_id: selectedStudent.id,
            class_id: targetClass!.id,
            school_year_id: targetClass!.school_year_id,
            school_year: targetClass!.school_year,
            program_id: targetClass!.program_id || null,
            status: 'ACTIVE',
          },
          { onConflict: 'student_id,class_id,school_year' },
        );
        if (error) throw error;
      }

      const { error: roleError } = await supabase
        .from('user_school_roles')
        .update({ status: meta.nextStatus })
        .eq('id', selectedStudent.roleId);
      if (roleError) throw roleError;

      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          class_id: meta.nextStatus === 'ACTIVE' ? targetClass?.id || selectedStudent.classId || null : null,
          status: meta.nextStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        })
        .eq('id', selectedStudent.id);
      if (profileError) throw profileError;

      const registrationResponse = await fetch('/api/student-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          action_type: meta.actionType,
          school_id: schoolId,
          former_class_id: selectedStudent.classId || '',
          former_class_name: currentClassName,
          new_class_id: targetClass?.id || '',
          new_class_name: targetClass?.name || '',
          other_school_name: otherSchoolName.trim(),
          reason: reason.trim(),
          details: `${meta.label} kroz e-Maticu`,
          registered_by: user.name || 'Administrator',
        }),
      });

      if (!registrationResponse.ok) {
        const text = await registrationResponse.text();
        throw new Error(text || 'Ne mogu zapisati službeni trag premještaja.');
      }

      await logSystemAction({
        executor_id: user.id,
        school_id: schoolId,
        action_type: `EMATICA_${mode}`,
        entity_type: 'STUDENT_TRANSFER',
        entity_id: selectedStudent.id,
        old_value: {
          classId: selectedStudent.classId || null,
          className: selectedStudent.className || null,
          status: selectedStudent.status,
        },
        new_value: {
          classId: targetClass?.id || null,
          className: targetClass?.name || null,
          status: meta.nextStatus,
          otherSchoolName: otherSchoolName.trim() || null,
          reason: reason.trim(),
        },
      });

      toast.success(`Promjena spremljena: ${meta.label}.`);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Spremanje promjene nije uspjelo: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-6 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="border-b border-[#dee2e6] pb-6">
          <div className="mb-2 inline-flex items-center gap-2 bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
            <ArrowRightLeft size={14} />
            <span>Premještaji učenika</span>
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">Prijelazi, ispisi i završeci školovanja</h1>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">
            Ovdje vodimo službenu promjenu statusa učenika: interni premještaj, prijelaz u drugu školu, povratni upis,
            ispis i završetak školovanja. Svaka promjena ostavlja administrativni trag.
          </p>
        </div>

        {!schoolId ? (
          <div className="border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-800">
            Najprije odaberi školu da bi e-Matica mogla voditi prijelaze.
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20 text-[#005c8d]">
            <Loader2 size={38} className="animate-spin" />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center gap-3 border border-slate-200 bg-slate-50 px-3 py-2">
                  <Search size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Pretraži po imenu, prezimenu, emailu ili razredu..."
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="mt-3 w-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
                >
                  <option value="ALL">Svi statusi</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="DROPPED_OUT">DROPPED_OUT</option>
                  <option value="TRANSFERRED">TRANSFERRED</option>
                  <option value="GRADUATED">GRADUATED</option>
                </select>
              </div>

              <div className="max-h-[70vh] overflow-y-auto">
                {filteredStudents.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => setSelectedStudentId(student.id)}
                    className={`block w-full border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50 ${
                      selectedStudentId === student.id ? 'bg-[#f3f8fc]' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">{[student.name, student.surname].filter(Boolean).join(' ')}</div>
                        <div className="mt-1 text-xs text-slate-500">{student.email || 'bez emaila'}</div>
                        <div className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                          {student.className || 'Neraspoređen'} {student.schoolYear ? `• ${student.schoolYear}` : ''}
                        </div>
                      </div>
                      <span className={`inline-flex border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusBadge(student.status)}`}>
                        {student.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              {!selectedStudent ? (
                <div className="border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 shadow-sm">
                  Odaberi učenika s lijeve strane za prikaz promjena statusa.
                </div>
              ) : (
                <>
                  <div className="border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">
                          {[selectedStudent.name, selectedStudent.surname].filter(Boolean).join(' ')}
                        </h2>
                        <p className="mt-2 text-sm text-slate-600">{selectedStudent.email || 'bez email adrese'}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Trenutni razred: <span className="font-bold text-slate-900">{selectedStudent.className || 'Neraspoređen'}</span>
                        </p>
                      </div>
                      <span className={`inline-flex border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${statusBadge(selectedStudent.status)}`}>
                        {selectedStudent.status}
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Nova promjena statusa</h3>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Vrsta promjene</label>
                        <select
                          value={mode}
                          onChange={(e) => setMode(e.target.value as TransferMode)}
                          className="w-full border border-slate-200 bg-white px-3 py-3 text-sm"
                        >
                          <option value="INTERNAL_TRANSFER">Interni premještaj</option>
                          <option value="TRANSFER_OUT">Prijelaz u drugu školu</option>
                          <option value="TRANSFER_IN">Prijelaz iz druge škole</option>
                          <option value="DROPOUT">Ispis / odustao</option>
                          <option value="GRADUATION">Završio školovanje</option>
                          <option value="REACTIVATE">Ponovni upis</option>
                        </select>
                      </div>

                      {['INTERNAL_TRANSFER', 'TRANSFER_IN', 'REACTIVATE'].includes(mode) && (
                        <div>
                          <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Ciljni razred</label>
                          <select
                            value={targetClassId}
                            onChange={(e) => setTargetClassId(e.target.value)}
                            className="w-full border border-slate-200 bg-white px-3 py-3 text-sm"
                          >
                            <option value="">Odaberi razred</option>
                            {eligibleClasses.map((cls) => (
                              <option key={cls.id} value={cls.id}>
                                {cls.name} • {cls.school_year}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {['TRANSFER_OUT', 'TRANSFER_IN'].includes(mode) && (
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Druga škola</label>
                          <input
                            type="text"
                            value={otherSchoolName}
                            onChange={(e) => setOtherSchoolName(e.target.value)}
                            placeholder="Naziv druge škole"
                            className="w-full border border-slate-200 bg-white px-3 py-3 text-sm"
                          />
                        </div>
                      )}

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Službeni razlog</label>
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={4}
                          placeholder="Upiši obrazloženje promjene statusa učenika..."
                          className="w-full border border-slate-200 bg-white px-3 py-3 text-sm"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 bg-[#005c8d] px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#00486f] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
                        <span>Spremi promjenu</span>
                      </button>
                    </div>
                  </form>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Brze napomene</h3>
                      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                        <div className="flex gap-3">
                          <UserRoundCheck size={16} className="mt-1 text-emerald-600" />
                          <p>
                            <span className="font-bold text-slate-900">Interni premještaj</span> zadržava učenika aktivnim i otvara novi aktivni razred.
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <Building2 size={16} className="mt-1 text-amber-600" />
                          <p>
                            <span className="font-bold text-slate-900">Prijelaz u drugu školu</span> zatvara aktivni razred i evidentira novu ustanovu.
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <UserRoundMinus size={16} className="mt-1 text-rose-600" />
                          <p>
                            <span className="font-bold text-slate-900">Ispis / odustao</span> ostavlja učenika u bazi, ali više nije aktivan u e-Dnevniku.
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <GraduationCap size={16} className="mt-1 text-blue-600" />
                          <p>
                            <span className="font-bold text-slate-900">Završio školovanje</span> ostaje trajno evidentiran za svjedodžbe i daljnje upise.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Povijest učenika</h3>
                      <div className="mt-4 space-y-3">
                        {selectedHistory.length === 0 ? (
                          <div className="border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                            Za ovog učenika još nema administrativnog traga.
                          </div>
                        ) : (
                          selectedHistory.map((item) => (
                            <div key={item.id} className="border border-slate-200 bg-slate-50 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">{item.action_type}</div>
                                <div className="text-[11px] text-slate-500">{item.date}</div>
                              </div>
                              <div className="mt-2 text-sm text-slate-700">
                                {[item.former_class_name, item.new_class_name].filter(Boolean).join(' → ') || item.other_school_name || 'Promjena statusa'}
                              </div>
                              {item.reason && <div className="mt-2 text-sm text-slate-600">{item.reason}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 font-black uppercase tracking-[0.14em]">
                      <ShieldAlert size={16} />
                      <span>Važno</span>
                    </div>
                    Svaka promjena ovdje utječe na aktivnost učenika u sustavu. Ne brišemo učenika iz baze, nego vodimo status kroz cijeli životni ciklus školovanja.
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
