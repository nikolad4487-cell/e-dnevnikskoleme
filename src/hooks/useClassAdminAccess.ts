import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { supabase } from '../lib/supabase';
import { Class, Role, User, UserSchoolRole } from '../types';

type MinimalClass = Partial<Class> & {
  school_id?: string;
  homeroom_teacher_id?: string;
  deputy_teacher_id?: string | null;
};

const ADMIN_ROLES = new Set<string>([
  Role.ADMIN,
  Role.SCHOOL_ADMIN,
  Role.MAIN_ADMIN,
  Role.SUPER_ADMIN,
]);

function normalizeRole(role: unknown) {
  return String(role || '').toUpperCase();
}

function getRoleSchoolId(role: Partial<UserSchoolRole> | any) {
  return role?.schoolId || role?.school_id || '';
}

function getClassSchoolId(classItem?: MinimalClass | null) {
  return classItem?.schoolId || classItem?.school_id || '';
}

export function userHasAdminRoleForSchool(
  user: User | null,
  userSchoolRoles: UserSchoolRole[] = [],
  schoolId?: string,
  isMainAdmin = false
) {
  const globalRole = normalizeRole((user as any)?.globalRole || user?.role || (user as any)?.access_role);

  if (isMainAdmin || globalRole === Role.MAIN_ADMIN || globalRole === Role.SUPER_ADMIN) {
    return true;
  }

  return (userSchoolRoles || []).some(role => {
    const roleName = normalizeRole(role?.role);
    if (!ADMIN_ROLES.has(roleName)) return false;
    if (role?.status && role.status !== 'ACTIVE') return false;

    const roleSchoolId = getRoleSchoolId(role);
    return !schoolId || roleSchoolId === schoolId;
  });
}

export function canManageClassAdministration(
  user: User | null,
  userSchoolRoles: UserSchoolRole[] = [],
  classItem?: MinimalClass | null,
  isMainAdmin = false
) {
  if (!user || !classItem) return false;

  const schoolId = getClassSchoolId(classItem);
  if (userHasAdminRoleForSchool(user, userSchoolRoles, schoolId, isMainAdmin)) {
    return true;
  }

  const userId = user.id;
  return (
    userId === classItem.homeroomTeacherId ||
    userId === classItem.homeroom_teacher_id ||
    userId === classItem.deputyTeacherId ||
    userId === classItem.deputy_teacher_id
  );
}

export function useClassAdminAccess(classId?: string | null) {
  const { user, userSchoolRoles, isMainAdmin } = useAuth();
  const { selectedSchoolId } = useSelection();
  const [classItem, setClassItem] = useState<MinimalClass | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadClassManagers() {
      if (!classId || !user) {
        setClassItem(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from('classes')
        .select('id, school_id, homeroom_teacher_id, deputy_teacher_id')
        .eq('id', classId)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        console.error('[CLASS ADMIN ACCESS] Failed to load class managers:', error);
        setClassItem(null);
      } else {
        setClassItem(data || null);
      }

      setLoading(false);
    }

    loadClassManagers();

    return () => {
      isMounted = false;
    };
  }, [classId, user]);

  const canAccessClassAdmin = useMemo(() => {
    const classSchoolId = getClassSchoolId(classItem);
    const fallbackClass = classItem || (selectedSchoolId ? { schoolId: selectedSchoolId } : null);

    if (!classItem && userHasAdminRoleForSchool(user, userSchoolRoles, selectedSchoolId || undefined, isMainAdmin)) {
      return true;
    }

    return canManageClassAdministration(
      user,
      userSchoolRoles,
      fallbackClass ? { ...fallbackClass, schoolId: classSchoolId || selectedSchoolId || undefined } : null,
      isMainAdmin
    );
  }, [classItem, isMainAdmin, selectedSchoolId, user, userSchoolRoles]);

  return { canAccessClassAdmin, loading, classItem };
}
