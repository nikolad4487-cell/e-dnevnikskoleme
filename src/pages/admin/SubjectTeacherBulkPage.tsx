import React from 'react';
import { CheckCircle, Plus, RefreshCw, Save, Trash2, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { Class, Role, Subject, User } from '../../types';
import { formatPersonName, formatSubjectDisplayName } from '../../lib/utils';

type Assignment = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
};

type ClassSubject = {
  id: string;
  class_id: string;
  subject_id: string;
  subject_type?: string | null;
  subject_period?: string | null;
};

type BulkRow = {
  key: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectType?: string | null;
  teachers: Assignment[];
};

type PendingChange = {
  teacherId: string;
  addedTeacherIds: string[];
  removedAssignmentIds: string[];
};

const emptyChange: PendingChange = {
  teacherId: '',
  addedTeacherIds: [],
  removedAssignmentIds: [],
};

export default function SubjectTeacherBulkPage() {
  const { selectedSchoolId, selectedYearId } = useSelection();
  const { userSchoolRoles, isMainAdmin } = useAuth();
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [teachers, setTeachers] = React.useState<User[]>([]);
  const [rows, setRows] = React.useState<BulkRow[]>([]);
  const [subjectFilter, setSubjectFilter] = React.useState('');
  const [classFilter, setClassFilter] = React.useState('');
  const [selectedKeys, setSelectedKeys] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState<Record<string, PendingChange>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const canManage = isMainAdmin || userSchoolRoles.some(role =>
    role.schoolId === selectedSchoolId && [Role.SCHOOL_ADMIN, Role.ADMIN].includes(role.role as Role)
  );

  const fetchData = React.useCallback(async () => {
    if (!selectedSchoolId) return;
    try {
      setLoading(true);
      const classQuery = supabase
        .from('classes')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('grade_level')
        .order('name');
      if (selectedYearId) classQuery.eq('school_year_id', selectedYearId);

      const [classRes, subjectRes, classSubjectRes, assignmentRes, teacherRoleRes] = await Promise.all([
        classQuery,
        supabase.from('subjects').select('*').eq('school_id', selectedSchoolId).order('name'),
        supabase.from('class_subjects').select('id, class_id, subject_id, subject_type, subject_period').eq('school_id', selectedSchoolId),
        supabase.from('class_subject_teachers').select('id, class_id, subject_id, teacher_id').eq('school_id', selectedSchoolId),
        supabase
          .from('user_school_roles')
          .select('user:user_profiles(*)')
          .eq('school_id', selectedSchoolId)
          .in('role', [Role.TEACHER, Role.HOMEROOM, Role.DEPUTY, Role.SCHOOL_ADMIN]),
      ]);

      if (classRes.error) throw classRes.error;
      if (subjectRes.error) throw subjectRes.error;
      if (classSubjectRes.error) throw classSubjectRes.error;
      if (assignmentRes.error) throw assignmentRes.error;
      if (teacherRoleRes.error) throw teacherRoleRes.error;

      const classItems = (classRes.data || []) as Class[];
      const subjectItems = (subjectRes.data || []) as Subject[];
      const classSubjectItems = (classSubjectRes.data || []) as ClassSubject[];
      const assignmentItems = (assignmentRes.data || []) as Assignment[];
      const classById = new Map(classItems.map(cls => [cls.id, cls]));
      const subjectById = new Map(subjectItems.map(subject => [subject.id, subject]));

      const builtRows = classSubjectItems
        .map(item => {
          const cls = classById.get(item.class_id);
          const subject = subjectById.get(item.subject_id);
          if (!cls || !subject) return null;
          return {
            key: `${item.class_id}:${item.subject_id}`,
            classId: item.class_id,
            className: cls.name,
            subjectId: item.subject_id,
            subjectName: subject.name,
            subjectType: item.subject_type,
            teachers: assignmentItems.filter(assignment =>
              assignment.class_id === item.class_id && assignment.subject_id === item.subject_id
            ),
          } as BulkRow;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.className.localeCompare(b.className, 'hr') || a.subjectName.localeCompare(b.subjectName, 'hr')) as BulkRow[];

      const rawTeachers = (teacherRoleRes.data || []).map((item: any) => item.user).filter(Boolean);
      const uniqueTeachers = rawTeachers.filter((teacher: any, index: number, self: any[]) =>
        self.findIndex(item => item.id === teacher.id) === index
      );

      setClasses(classItems);
      setSubjects(subjectItems);
      setTeachers(uniqueTeachers as User[]);
      setRows(builtRows);
      setSelectedKeys([]);
      setPending({});
    } catch (err: any) {
      console.error('SubjectTeacherBulkPage fetch error', err);
      toast.error('Nije moguće učitati dodjele nastavnika.');
    } finally {
      setLoading(false);
    }
  }, [selectedSchoolId, selectedYearId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const teacherById = React.useMemo(() => new Map(teachers.map(teacher => [teacher.id, teacher])), [teachers]);
  const filteredRows = React.useMemo(() => rows.filter(row =>
    (!subjectFilter || row.subjectId === subjectFilter) &&
    (!classFilter || row.classId === classFilter)
  ), [classFilter, rows, subjectFilter]);

  const setRowChange = (key: string, updater: (current: PendingChange) => PendingChange) => {
    setPending(current => ({ ...current, [key]: updater(current[key] || emptyChange) }));
  };

  const addPendingTeacher = (row: BulkRow) => {
    const change = pending[row.key] || emptyChange;
    if (!change.teacherId) return;
    const alreadyAssigned = row.teachers.some(assignment =>
      assignment.teacher_id === change.teacherId && !change.removedAssignmentIds.includes(assignment.id)
    );
    if (alreadyAssigned || change.addedTeacherIds.includes(change.teacherId)) {
      toast.error('Nastavnik je već dodan na taj predmet u tom razredu.');
      return;
    }
    setRowChange(row.key, current => ({
      ...current,
      teacherId: '',
      addedTeacherIds: [...current.addedTeacherIds, current.teacherId],
    }));
    setSelectedKeys(current => current.includes(row.key) ? current : [...current, row.key]);
  };

  const removeTeacher = (row: BulkRow, assignment: Assignment) => {
    setRowChange(row.key, current => ({
      ...current,
      removedAssignmentIds: current.removedAssignmentIds.includes(assignment.id)
        ? current.removedAssignmentIds.filter(id => id !== assignment.id)
        : [...current.removedAssignmentIds, assignment.id],
    }));
    setSelectedKeys(current => current.includes(row.key) ? current : [...current, row.key]);
  };

  const saveSelectedRows = async () => {
    if (!canManage) {
      toast.error('Nemate dozvolu za masovnu dodjelu nastavnika.');
      return;
    }
    const rowsToSave = rows.filter(row => selectedKeys.includes(row.key));
    if (rowsToSave.length === 0) return;

    try {
      setSaving(true);
      const assignmentIdsToDelete = rowsToSave.flatMap(row => pending[row.key]?.removedAssignmentIds || []);
      const assignmentsToInsert = rowsToSave.flatMap(row => {
        const change = pending[row.key] || emptyChange;
        return change.addedTeacherIds.map(teacherId => ({
          class_id: row.classId,
          subject_id: row.subjectId,
          teacher_id: teacherId,
          school_id: selectedSchoolId,
        }));
      });

      if (assignmentIdsToDelete.length > 0) {
        const { error } = await supabase.from('class_subject_teachers').delete().in('id', assignmentIdsToDelete);
        if (error) throw error;
      }

      if (assignmentsToInsert.length > 0) {
        const { error } = await supabase
          .from('class_subject_teachers')
          .upsert(assignmentsToInsert, { onConflict: 'class_id,subject_id,teacher_id' });
        if (error) throw error;
      }

      toast.success('Dodjele nastavnika su spremljene.');
      await fetchData();
    } catch (err: any) {
      console.error('SubjectTeacherBulkPage save error', err);
      toast.error('Spremanje dodjela nije uspjelo: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <div className="ed-header">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[#005c8d]" />
          <span>Masovna dodjela nastavnika predmetima</span>
        </div>
        <button type="button" onClick={fetchData} className="text-[10px] uppercase font-bold text-[#005c8d] hover:underline">
          Osvježi
        </button>
      </div>

      <div className="ed-content space-y-4">
        <div className="bg-white border border-[#dee2e6] rounded-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Predmet</label>
            <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="w-full border border-slate-300 rounded-sm p-2 text-xs">
              <option value="">Svi predmeti</option>
              {subjects.map(subject => (
                <option key={subject.id} value={subject.id}>{formatSubjectDisplayName(subject.name, 'REDOVNI')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Razred</label>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="w-full border border-slate-300 rounded-sm p-2 text-xs">
              <option value="">Svi razredi</option>
              {classes.map(cls => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={saving || selectedKeys.length === 0}
              onClick={saveSelectedRows}
              className={`w-full flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white ${saving || selectedKeys.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#005c8d] hover:bg-[#004a71]'}`}
            >
              <Save size={13} /> Spremi označene retke ({selectedKeys.length})
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[#005c8d]">Razredi i predmetne dodjele</h3>
            <span className="text-[10px] text-slate-400 font-bold">{filteredRows.length}</span>
          </div>

          {loading ? (
            <div className="p-16 flex justify-center text-[#005c8d]"><RefreshCw className="animate-spin" /></div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 italic">Nema razreda koji sadrže odabrani predmet.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedKeys.length > 0 && filteredRows.every(row => selectedKeys.includes(row.key))}
                        onChange={e => setSelectedKeys(e.target.checked ? filteredRows.map(row => row.key) : [])}
                        className="accent-[#005c8d]"
                      />
                    </th>
                    <th className="p-2 text-left">Razred</th>
                    <th className="p-2 text-left">Predmet</th>
                    <th className="p-2 text-left">Trenutni nastavnici</th>
                    <th className="p-2 text-left min-w-[260px]">Brza izmjena</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => {
                    const change = pending[row.key] || emptyChange;
                    const visibleAssignments = row.teachers.filter(assignment => !change.removedAssignmentIds.includes(assignment.id));
                    const addedTeachers = change.addedTeacherIds.map(id => teacherById.get(id)).filter(Boolean) as User[];
                    return (
                      <tr key={row.key} className="border-t border-slate-100 align-top">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedKeys.includes(row.key)}
                            onChange={e => setSelectedKeys(current => e.target.checked ? [...current, row.key] : current.filter(key => key !== row.key))}
                            className="accent-[#005c8d]"
                          />
                        </td>
                        <td className="p-2 font-black text-slate-800">{row.className}</td>
                        <td className="p-2">
                          <div className="font-bold text-slate-800">{formatSubjectDisplayName(row.subjectName, row.subjectType || 'REDOVNI')}</div>
                          {row.subjectType && <div className="text-[10px] text-slate-400 uppercase">{row.subjectType}</div>}
                        </td>
                        <td className="p-2 space-y-1">
                          {visibleAssignments.length === 0 && addedTeachers.length === 0 ? (
                            <span className="text-slate-300 italic">Nema nastavnika</span>
                          ) : (
                            <>
                              {visibleAssignments.map((assignment, index) => {
                                const teacher = teacherById.get(assignment.teacher_id);
                                return (
                                  <div key={assignment.id} className="flex items-center gap-2">
                                    <span className="text-[9px] uppercase font-black text-slate-400 w-14">{index === 0 ? 'Glavni' : 'Dodatni'}</span>
                                    <span className="font-semibold text-slate-700">{teacher ? formatPersonName(teacher) : assignment.teacher_id}</span>
                                    <button type="button" onClick={() => removeTeacher(row, assignment)} className="text-red-600 hover:text-red-800" title="Označi za uklanjanje">
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                              {addedTeachers.map(teacher => (
                                <div key={teacher.id} className="flex items-center gap-2 text-green-700">
                                  <CheckCircle size={11} />
                                  <span className="font-semibold">{formatPersonName(teacher)}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <select
                              value={change.teacherId}
                              onChange={e => setRowChange(row.key, current => ({ ...current, teacherId: e.target.value }))}
                              className="flex-1 border border-slate-300 rounded-sm p-2 text-xs"
                            >
                              <option value="">Odaberi nastavnika</option>
                              {teachers.map(teacher => (
                                <option key={teacher.id} value={teacher.id}>{formatPersonName(teacher)}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => addPendingTeacher(row)} className="px-3 rounded-sm bg-slate-100 hover:bg-slate-200 text-[#005c8d] font-black" title="Dodaj nastavnika">
                              <Plus size={14} />
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
      </div>
    </div>
  );
}
