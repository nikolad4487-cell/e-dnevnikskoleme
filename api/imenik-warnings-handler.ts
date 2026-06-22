import { createClient } from '@supabase/supabase-js';
import { authenticator } from 'otplib';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  '';

const admin =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const ADMIN_ROLES = new Set(['ADMIN', 'SCHOOL_ADMIN', 'MAIN_ADMIN']);

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0] == null ? undefined : String(value[0]);
  return value == null ? undefined : String(value);
}

function normalizeStatus(value: unknown): string {
  return String(value || 'PENDING').trim().toUpperCase();
}

function getRecordDate(record: Record<string, any>): Date | null {
  const value = record.date || record.created_at || record.updated_at;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getBearerToken(req: any): string {
  const authorization = String(req.headers?.authorization || '');
  return authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
}

async function getAuthenticatedProfile(req: any) {
  if (!admin) {
    return {
      error: {
        status: 503,
        body: {
          success: false,
          error: 'Supabase admin klijent nije konfiguriran na Vercelu.',
          code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
        },
      },
    };
  }

  const token = getBearerToken(req);
  if (!token) {
    return {
      error: {
        status: 401,
        body: { success: false, error: 'Niste prijavljeni.' },
      },
    };
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return {
      error: {
        status: 401,
        body: { success: false, error: 'Sesija nije valjana.' },
      },
    };
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id, role, access_role, authenticator_secret, requires_authenticator_setup')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      error: {
        status: 401,
        body: { success: false, error: 'Korisnički profil nije pronađen.' },
      },
    };
  }

  const { data: roleRows, error: rolesError } = await admin
    .from('user_school_roles')
    .select('role, school_id, status')
    .eq('user_id', profile.id);

  if (rolesError) throw rolesError;

  return {
    profile,
    roles: roleRows || [],
  };
}

function isAdminForSchool(profile: any, roles: any[], schoolId: string | null): boolean {
  const profileRoles = [profile?.role, profile?.access_role]
    .filter(Boolean)
    .map((role) => String(role).toUpperCase());

  if (profileRoles.includes('MAIN_ADMIN')) return true;

  return roles.some((row: any) => {
    if (normalizeStatus(row.status) !== 'ACTIVE') return false;

    const role = String(row.role || '').toUpperCase();
    if (!ADMIN_ROLES.has(role)) return false;
    if (role === 'MAIN_ADMIN') return true;

    return !schoolId || !row.school_id || row.school_id === schoolId;
  });
}

async function deleteGrade(req: any, res: any) {
  if (!admin) {
    return res.status(503).json({
      success: false,
      error: 'Supabase admin klijent nije konfiguriran na Vercelu.',
      code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
    });
  }

  const authResult = await getAuthenticatedProfile(req);
  if ('error' in authResult && authResult.error) {
    return res.status(authResult.error.status).json(authResult.error.body);
  }

  const profile = authResult.profile;
  const roles = authResult.roles || [];
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const gradeId = String(body.gradeId || '').trim();
  const authenticatorCode = String(body.authenticatorCode || '').replace(/\s+/g, '');

  if (!gradeId) {
    return res.status(400).json({ success: false, error: 'Nedostaje ID ocjene.' });
  }

  const { data: grade, error: gradeError } = await admin
    .from('grades')
    .select('id, teacher_id, school_id, class_id, created_at')
    .eq('id', gradeId)
    .maybeSingle();

  if (gradeError) throw gradeError;
  if (!grade) {
    return res.status(404).json({ success: false, error: 'Ocjena nije pronađena.' });
  }

  const isAdmin = isAdminForSchool(profile, roles, grade.school_id || null);
  const isCreator = grade.teacher_id === profile.id;

  const createdAt = grade.created_at ? new Date(grade.created_at) : null;
  const hasValidCreatedAt = Boolean(createdAt && !Number.isNaN(createdAt.getTime()));
  const ageMinutes = hasValidCreatedAt
    ? Math.max(0, (Date.now() - createdAt!.getTime()) / 60000)
    : Number.POSITIVE_INFINITY;
  const isOlderThan45Minutes = ageMinutes > 45;

  if (!isOlderThan45Minutes && !isCreator && !isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Ocjenu unutar 45 minuta može obrisati samo nastavnik koji ju je upisao ili administrator.',
      code: 'GRADE_DELETE_NOT_OWNER',
    });
  }

  if (isOlderThan45Minutes) {
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Nakon 45 minuta ocjenu može obrisati samo administrator uz kod iz autentifikatora.',
        code: 'GRADE_DELETE_ADMIN_REQUIRED',
      });
    }

    if (profile.requires_authenticator_setup || !profile.authenticator_secret) {
      return res.status(403).json({
        success: false,
        error: 'Administrator nema postavljen autentifikator.',
        code: 'AUTHENTICATOR_NOT_CONFIGURED',
      });
    }

    if (!/^\d{6}$/.test(authenticatorCode)) {
      return res.status(400).json({
        success: false,
        error: 'Unesite važeći 6-znamenkasti kod iz autentifikatora.',
        code: 'AUTHENTICATOR_CODE_REQUIRED',
      });
    }

    const isAuthenticatorCodeValid = authenticator.check(
      authenticatorCode,
      profile.authenticator_secret
    );

    if (!isAuthenticatorCodeValid) {
      return res.status(401).json({
        success: false,
        error: 'Neispravan kod iz autentifikatora.',
        code: 'AUTHENTICATOR_CODE_INVALID',
      });
    }
  }

  const { data: deletedRows, error: deleteError } = await admin
    .from('grades')
    .delete()
    .eq('id', gradeId)
    .select('id');

  if (deleteError) throw deleteError;
  if (!deletedRows || deletedRows.length === 0) {
    return res.status(409).json({
      success: false,
      error: 'Ocjena nije obrisana. Osvježite stranicu i pokušajte ponovno.',
      code: 'GRADE_NOT_DELETED',
    });
  }

  return res.status(200).json({
    success: true,
    deletedGradeId: gradeId,
    requiredAuthenticator: isOlderThan45Minutes,
  });
}

async function getImenikWarnings(req: any, res: any) {
  if (!admin) {
    return res.status(503).json({
      success: false,
      error: 'Supabase admin klijent nije konfiguriran na Vercelu.',
      code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
    });
  }

  const classId = first(req.query?.classId);
  if (!classId) {
    return res.status(400).json({ success: false, error: 'Nedostaje classId.' });
  }

  const authResult = await getAuthenticatedProfile(req);
  if ('error' in authResult && authResult.error) {
    return res.status(authResult.error.status).json(authResult.error.body);
  }

  const { data: enrollmentRows, error: enrollmentError } = await admin
    .from('student_class_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .eq('status', 'ACTIVE');

  if (enrollmentError) throw enrollmentError;

  const studentIds = Array.from(
    new Set((enrollmentRows || []).map((row: any) => row.student_id).filter(Boolean))
  );

  if (studentIds.length === 0) {
    return res.status(200).json({
      success: true,
      failingGrades: {},
      pendingAbsences: {},
      diagnostics: { enrolledStudents: 0, gradeRows: 0, absenceRows: 0 },
    });
  }

  const [gradesResult, absencesResult] = await Promise.all([
    admin
      .from('grades')
      .select('student_id, class_id, value, date, created_at, is_final')
      .in('student_id', studentIds),
    admin
      .from('absences')
      .select('student_id, class_id, status, date, created_at')
      .in('student_id', studentIds),
  ]);

  if (gradesResult.error) throw gradesResult.error;
  if (absencesResult.error) throw absencesResult.error;

  const fromDate = new Date();
  fromDate.setHours(0, 0, 0, 0);
  fromDate.setDate(fromDate.getDate() - 30);

  const failingGrades: Record<string, number> = {};
  for (const grade of gradesResult.data || []) {
    if (!grade.student_id || Number(grade.value) !== 1 || grade.is_final === true) continue;
    if (grade.class_id && grade.class_id !== classId) continue;

    const gradeDate = getRecordDate(grade);
    if (gradeDate && gradeDate < fromDate) continue;

    failingGrades[grade.student_id] = (failingGrades[grade.student_id] || 0) + 1;
  }

  const pendingAbsences: Record<string, boolean> = {};
  for (const absence of absencesResult.data || []) {
    if (!absence.student_id) continue;
    if (absence.class_id && absence.class_id !== classId) continue;

    if (normalizeStatus(absence.status) === 'PENDING') {
      pendingAbsences[absence.student_id] = true;
    }
  }

  return res.status(200).json({
    success: true,
    failingGrades,
    pendingAbsences,
    diagnostics: {
      enrolledStudents: studentIds.length,
      gradeRows: gradesResult.data?.length || 0,
      absenceRows: absencesResult.data?.length || 0,
      warningStudents: new Set([
        ...Object.keys(failingGrades),
        ...Object.keys(pendingAbsences),
      ]).size,
    },
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      return await getImenikWarnings(req, res);
    }

    if (req.method === 'DELETE') {
      return await deleteGrade(req, res);
    }

    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  } catch (error: any) {
    console.error('IMENIK DATA API ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Došlo je do pogreške pri obradi zahtjeva.',
      details: error?.details || null,
      hint: error?.hint || null,
      code: error?.code || null,
    });
  }
}
