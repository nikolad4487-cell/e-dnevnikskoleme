/** A specialist's membership is scoped to a school, never inferred from a name. */
export function isExpertForSchool(user: any, roles: any[] = [], schoolId?: string | null): boolean {
  return roles.some(r => String(r.role).toUpperCase() === 'EXPERT'
    && String(r.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
    && (!schoolId || (r.schoolId || r.school_id) === schoolId));
}
export function isHomeroomPeriod(name: unknown): boolean {
  return ['sat razrednika', 'sat razredne zajednice', 'sat razrednog odjela', 'sr']
    .includes(String(name || '').trim().toLocaleLowerCase('hr'));
}
