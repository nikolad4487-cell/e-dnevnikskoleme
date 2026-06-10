import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { logSystemAction } from '../../utils/auditLogger';
import {
  ArrowLeftRight,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  Users,
} from 'lucide-react';

interface SyncStudentRow {
  id: string;
  name: string;
  surname?: string;
  email?: string;
  roleStatus: string;
  profileStatus?: string;
  classId?: string | null;
  className?: string;
  schoolYear?: string;
}

interface RegistrationRow {
  id: string;
  student_id: string;
  action_type: string;
  date: string;
  reason?: string;
  former_class_name?: string;
  new_class_name?: string;
}

interface SyncAuditRow {
  id: string;
  action_type: string;
  created_at: string;
  new_value?: {
    synced?: number;
    updated?: number;
    skipped?: number;
    direction?: string;
  };
}

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

function getStatusBadge(status: string) {
  const upper = (status || '').toUpperCase();
  if (upper === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (upper === 'GRADUATED') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (upper === 'TRANSFERRED') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (upper === 'DROPPED_OUT') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

export default function EmaticaSyncPage() {
  const { selectedSchoolId } = useSelection();
  const { user, userSchoolRoles } = useAuth();
  const schoolId = resolveSchoolId(selectedSchoolId, user, userSchoolRoles);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<'from' | 'to' | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [students, setStudents] = useState<SyncStudentRow[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [auditRows, setAuditRows] = useState<SyncAuditRow[]>([]);

  const fetchData = async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [{ data: school }, { data: roles, error: rolesError }, { data: classes }, { data: enrollments }, { data: logs }] =
        await Promise.all([
          supabase.from('schools').select('name').eq('id', schoolId).maybeSingle(),
          supabase
            .from('user_school_roles')
            .select('id, user_id, status, user:user_profiles(id, name, surname, email, status, class_id)')
            .eq('school_id', schoolId)
            .eq('role', 'STUDENT'),
          supabase.from('classes').select('id, name, school_year').eq('school_id', schoolId),
          supabase
            .from('student_class_enrollments')
            .select('id, student_id, class_id, school_year, status')
            .order('created_at', { ascending: false }),
          supabase
            .from('system_audit_logs')
            .select('id, action_type, created_at, new_value')
            .eq('school_id', schoolId)
            .eq('entity_type', 'EMATICA_SYNC')
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

      if (rolesError) throw rolesError;

      const regResponse = await fetch(`/api/student-registrations?schoolId=${encodeURIComponent(schoolId)}`);
      const regData = regResponse.ok ? await regResponse.json() : [];

      setSchoolName(school?.name || '');
      setRegistrations(Array.isArray(regData) ? regData : []);
      setAuditRows((logs as SyncAuditRow[]) || []);

      const classMap = new Map((classes || []).map((cls: any) => [cls.id, cls]));
      const activeEnrollmentMap = new Map<string, any>();

      (enrollments || []).forEach((enrollment: any) => {
        const existing = activeEnrollmentMap.get(enrollment.student_id);
        if (!existing || enrollment.status === 'ACTIVE') {
          activeEnrollmentMap.set(enrollment.student_id, enrollment);
        }
      });

      const mapped = (roles || []).map((roleRow: any) => {
        const profile = Array.isArray(roleRow.user) ? roleRow.user[0] : roleRow.user;
        const enrollment = activeEnrollmentMap.get(roleRow.user_id);
        const cls = enrollment?.class_id ? classMap.get(enrollment.class_id) : null;

        return {
          id: profile?.id || roleRow.user_id,
          name: profile?.name || '',
          surname: profile?.surname || '',
          email: profile?.email || '',
          roleStatus: roleRow.status || 'ACTIVE',
          profileStatus: profile?.status || '',
          classId: enrollment?.class_id || profile?.class_id || null,
          className: cls?.name || 'Neraspoređen',
          schoolYear: enrollment?.school_year || cls?.school_year || '',
        } satisfies SyncStudentRow;
      });

      setStudents(mapped);
    } catch (err: any) {
      console.error(err);
      toast.error('Ne mogu učitati stanje sinkronizacije.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [schoolId]);

  const summary = useMemo(() => {
    const registrationsByStudent = new Set(registrations.map((item) => item.student_id));

    const activeStudents = students.filter((student) => student.roleStatus === 'ACTIVE');
    const missingEnrollment = activeStudents.filter((student) => !student.classId);
    const missingRegistration = activeStudents.filter((student) => !registrationsByStudent.has(student.id));
    const statusMismatch = students.filter((student) => {
      if (student.roleStatus === 'ACTIVE') return student.profileStatus === 'INACTIVE';
      return student.profileStatus === 'ACTIVE';
    });

    return {
      total: students.length,
      active: activeStudents.length,
      missingEnrollment: missingEnrollment.length,
      missingRegistration: missingRegistration.length,
      statusMismatch: statusMismatch.length,
    };
  }, [students, registrations]);

  const handlePullFromEdnevnik = async () => {
    if (!schoolId || !user?.id) return;

    try {
      setRunning('from');
      let synced = 0;
      let skipped = 0;

      for (const student of students) {
        if (student.roleStatus !== 'ACTIVE') {
          skipped += 1;
          continue;
        }

        const existingReg = registrations.find((item) => item.student_id === student.id);
        if (existingReg) {
          skipped += 1;
          continue;
        }

        const response = await fetch('/api/student-registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: student.id,
            action_type: 'UPIS',
            school_id: schoolId,
            former_class_name: '',
            new_class_name: student.className || '',
            new_class_id: student.classId || '',
            reason: 'Automatsko povlačenje iz e-Dnevnika u e-Maticu',
            details: `Sinkronizirano iz e-Dnevnika za školsku godinu ${student.schoolYear || 'nije definirana'}.`,
            registered_by: user.name || 'Sustav',
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Neuspješno zapisivanje registracije.');
        }

        synced += 1;
      }

      await logSystemAction({
        executor_id: user.id,
        school_id: schoolId,
        action_type: 'SYNC_FROM_EDNEVNIK',
        entity_type: 'EMATICA_SYNC',
        entity_id: schoolId,
        new_value: {
          direction: 'FROM_EDNEVNIK',
          synced,
          skipped,
          at: new Date().toISOString(),
        },
      });

      toast.success(`Sinkronizacija iz e-Dnevnika završena. Dodano: ${synced}, preskočeno: ${skipped}.`);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Sinkronizacija iz e-Dnevnika nije uspjela: ' + err.message);
    } finally {
      setRunning(null);
    }
  };

  const handlePrepareForEdnevnik = async () => {
    if (!schoolId || !user?.id) return;

    try {
      setRunning('to');
      let updated = 0;
      let skipped = 0;

      for (const student of students) {
        const targetStatus = student.roleStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
        const targetClassId = student.roleStatus === 'ACTIVE' ? student.classId || null : null;

        const { error } = await supabase
          .from('user_profiles')
          .update({
            status: targetStatus,
            class_id: targetClassId,
          })
          .eq('id', student.id);

        if (error) {
          skipped += 1;
          continue;
        }

        updated += 1;
      }

      await logSystemAction({
        executor_id: user.id,
        school_id: schoolId,
        action_type: 'SYNC_TO_EDNEVNIK',
        entity_type: 'EMATICA_SYNC',
        entity_id: schoolId,
        new_value: {
          direction: 'TO_EDNEVNIK',
          updated,
          skipped,
          at: new Date().toISOString(),
        },
      });

      toast.success(`Priprema za e-Dnevnik završena. Ažurirano: ${updated}, preskočeno: ${skipped}.`);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Priprema za e-Dnevnik nije uspjela: ' + err.message);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-6 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="border-b border-[#dee2e6] pb-6">
          <div className="mb-2 inline-flex items-center gap-2 bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
            <Database size={14} />
            <span>e-Matica sinkronizacija</span>
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">Most između e-Matice i e-Dnevnika</h1>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">
            Ovdje usklađujemo administrativni sloj s operativnim radom škole. Na početku godine podaci idu prema e-Dnevniku,
            a kroz godinu i na kraju godine e-Matica povlači i zaključava službenu evidenciju.
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Aktivna škola: {schoolName || 'nije odabrana'}
          </p>
        </div>

        {!schoolId ? (
          <div className="border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-800">
            Najprije odaberi školu da bi e-Matica znala s kojim podacima radi.
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20 text-[#005c8d]">
            <Loader2 size={38} className="animate-spin" />
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <Users className="mb-3 text-[#005c8d]" size={20} />
                <div className="text-3xl font-black text-slate-900">{summary.total}</div>
                <div className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Ukupno učenika</div>
              </div>
              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <UserCheck className="mb-3 text-emerald-600" size={20} />
                <div className="text-3xl font-black text-slate-900">{summary.active}</div>
                <div className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Aktivnih učenika</div>
              </div>
              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <TriangleAlert className="mb-3 text-amber-600" size={20} />
                <div className="text-3xl font-black text-slate-900">{summary.missingEnrollment}</div>
                <div className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Bez razreda</div>
              </div>
              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <ArrowLeftRight className="mb-3 text-sky-600" size={20} />
                <div className="text-3xl font-black text-slate-900">{summary.missingRegistration}</div>
                <div className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Bez upisnog traga</div>
              </div>
              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <ShieldCheck className="mb-3 text-rose-600" size={20} />
                <div className="text-3xl font-black text-slate-900">{summary.statusMismatch}</div>
                <div className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Status nesklada</div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <div className="border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Operacije sinkronizacije</h2>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center gap-3">
                        <RefreshCw size={18} className="text-[#005c8d]" />
                        <h3 className="text-sm font-black uppercase tracking-[0.08em] text-slate-900">Povuci iz e-Dnevnika</h3>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        Kreira administrativni trag upisa za učenike koji postoje u e-Dnevniku, ali još nemaju e-Matica evidenciju.
                      </p>
                      <button
                        type="button"
                        onClick={handlePullFromEdnevnik}
                        disabled={running !== null}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-[#005c8d] px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#00486f] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {running === 'from' ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                        <span>Pokreni povlačenje</span>
                      </button>
                    </div>

                    <div className="border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center gap-3">
                        <ArrowLeftRight size={18} className="text-[#005c8d]" />
                        <h3 className="text-sm font-black uppercase tracking-[0.08em] text-slate-900">Pripremi za e-Dnevnik</h3>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        Usklađuje `user_profiles` status i razred kako bi e-Dnevnik radio nad ažurnim aktivnim odjelima.
                      </p>
                      <button
                        type="button"
                        onClick={handlePrepareForEdnevnik}
                        disabled={running !== null}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {running === 'to' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        <span>Uskladi za početak godine</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Učenici za provjeru</h2>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                          <th className="px-3 py-3">Učenik</th>
                          <th className="px-3 py-3">Razred</th>
                          <th className="px-3 py-3">Godina</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Profil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.slice(0, 12).map((student) => (
                          <tr key={student.id} className="border-b border-slate-100">
                            <td className="px-3 py-3">
                              <div className="font-bold text-slate-900">{[student.name, student.surname].filter(Boolean).join(' ')}</div>
                              <div className="text-xs text-slate-500">{student.email || 'bez emaila'}</div>
                            </td>
                            <td className="px-3 py-3 text-slate-700">{student.className || 'Neraspoređen'}</td>
                            <td className="px-3 py-3 text-slate-700">{student.schoolYear || '-'}</td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${getStatusBadge(student.roleStatus)}`}>
                                {student.roleStatus}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-700">{student.profileStatus || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <aside className="space-y-6">
                <div className="border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Zadnje sinkronizacije</h2>
                  <div className="mt-4 space-y-3">
                    {auditRows.length === 0 ? (
                      <div className="border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        Još nema zabilježene sinkronizacije za ovu školu.
                      </div>
                    ) : (
                      auditRows.map((row) => (
                        <div key={row.id} className="border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">{row.action_type}</div>
                            <div className="text-[11px] text-slate-500">{new Date(row.created_at).toLocaleString('hr-HR')}</div>
                          </div>
                          {row.new_value && (
                            <div className="mt-2 text-sm text-slate-600">
                              Smjer: {row.new_value.direction || '-'}, obrađeno: {row.new_value.synced ?? row.new_value.updated ?? 0}, preskočeno: {row.new_value.skipped ?? 0}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-[#cfe3f1] bg-[#f3f8fc] p-6 text-sm leading-6 text-[#0f3550] shadow-sm">
                  Praktično pravilo rada: na početku godine razrednik ili admin priprema e-Dnevnik iz e-Matice, a na kraju godine
                  e-Matica povlači konačno stanje i postaje službena evidencija za svjedodžbe i daljnje upise.
                </div>

                <div className="border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 font-black uppercase tracking-[0.14em]">
                    <CheckCircle2 size={16} />
                    <span>Što ova stranica radi</span>
                  </div>
                  Ovdje ne dupliramo učenike. Sinkronizacija nadograđuje i usklađuje postojeće profile, razrede i administrativni trag.
                </div>
              </aside>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
