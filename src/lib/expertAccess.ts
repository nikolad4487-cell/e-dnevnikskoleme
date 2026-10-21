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

export function isPrincipalForSchool(user: any, roles: any[] = [], schoolId?: string | null): boolean {
  return roles.some(r => r.role === 'PRINCIPAL' && (!r.status || r.status === 'ACTIVE')
    && (!schoolId || (r.schoolId || r.school_id) === schoolId));
}
/** Roles that may inspect every class without a teaching assignment. */
export function isSchoolObserver(user: any, roles: any[] = [], schoolId?: string | null): boolean {
  return isExpertForSchool(user, roles, schoolId) || isPrincipalForSchool(user, roles, schoolId);
}
