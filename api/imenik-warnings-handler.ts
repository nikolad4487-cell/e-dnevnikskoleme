import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const admin = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0] == null ? undefined : String(value[0]);
  return value == null ? undefined : String(value);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  if (!admin) {
    return res.status(503).json({ success: false, error: 'Supabase nije konfiguriran.' });
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
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const sinceDate = fromDate.toISOString().slice(0, 10);

    const [gradesResult, absencesResult] = await Promise.all([
      admin
        .from('grades')
        .select('student_id, value, date')
        .eq('class_id', classId)
        .gte('date', sinceDate),
      admin
        .from('absences')
        .select('student_id, status')
        .eq('class_id', classId),
    ]);

    if (gradesResult.error) throw gradesResult.error;
    if (absencesResult.error) throw absencesResult.error;

    const failingGrades: Record<string, number> = {};
    for (const grade of gradesResult.data || []) {
      if (!grade.student_id || Number(grade.value) !== 1) continue;
      failingGrades[grade.student_id] = (failingGrades[grade.student_id] || 0) + 1;
    }

    const pendingAbsences: Record<string, boolean> = {};
    for (const absence of absencesResult.data || []) {
      if (!absence.student_id) continue;
      const status = String(absence.status || 'PENDING').trim().toUpperCase();
      if (status === 'PENDING') pendingAbsences[absence.student_id] = true;
    }

    return res.status(200).json({
      success: true,
      failingGrades,
      pendingAbsences,
      sinceDate,
    });
  } catch (error: any) {
    console.error('IMENIK WARNINGS API ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Greška pri učitavanju upozorenja.',
      code: error?.code || null,
    });
  }
}
