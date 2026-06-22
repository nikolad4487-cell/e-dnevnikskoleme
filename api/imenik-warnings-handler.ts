import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
// Production currently initializes the main backend with either variable.
// Keep the same compatibility here so this endpoint does not silently run without an admin client.
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

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

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

  const authorization = String(req.headers?.authorization || '');
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';

  if (!token) {
    return res.status(401).json({ success: false, error: 'Niste prijavljeni.' });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return res.status(401).json({ success: false, error: 'Sesija nije valjana.' });
  }

  try {
    // The register is built from student_class_enrollments, therefore warnings must
    // use exactly the same student IDs instead of relying only on class_id being
    // present and correct on every historical grade/absence row.
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
  } catch (error: any) {
    console.error('IMENIK WARNINGS API ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Greška pri učitavanju upozorenja.',
      details: error?.details || null,
      hint: error?.hint || null,
      code: error?.code || null,
    });
  }
}
