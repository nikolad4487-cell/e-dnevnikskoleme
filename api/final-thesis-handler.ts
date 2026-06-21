import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  '';

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const DB_FIELDS = new Set([
  'id',
  'student_id',
  'class_id',
  'school_id',
  'school_year_id',
  'thesis_title',
  'mentor_name',
  'mentor_id',
  'exam_period',
  'student_note',
  'status',
  'submitted_at',
  'created_at',
  'updated_at',
  'creation_grade',
  'defense_grade',
  'final_grade',
  'creation_date',
  'defense_date',
  'final_grade_date',
  'creation_graded_by',
  'defense_graded_by',
  'final_graded_by',
  'application_classification_number',
  'application_registry_number',
  'application_data_entered_at',
  'application_data_entered_by',
  'accepted_at',
  'accepted_by',
  'rejected_at',
  'rejected_by',
  'rejection_note',
  'deregistration_note',
  'deregistered_at',
  'deregistration_classification_number',
  'deregistration_registry_number',
  'deregistration_data_entered_at',
  'deregistration_data_entered_by',
]);

const OBSOLETE_INDIVIDUAL_DEFENSE_FIELDS = [
  'defense_time',
  'defense_classroom',
  'defense_committee',
];

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0] == null ? undefined : String(value[0]);
  return value == null ? undefined : String(value);
}

function parseBody(body: unknown): Record<string, any> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? { ...(body as Record<string, any>) } : {};
}

function sanitize(data: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(data).filter(([key, value]) => DB_FIELDS.has(key) && value !== undefined)
  );
}

function sendDatabaseError(res: any, error: any) {
  return res.status(500).json({
    error: error?.message || 'Greška baze podataka.',
    details: error?.details || null,
    hint: error?.hint || null,
    code: error?.code || null,
  });
}

async function resolveContext(studentId: string, suppliedClassId?: string | null) {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured.');

  let classId = suppliedClassId && suppliedClassId !== 'N/A' ? suppliedClassId : null;

  if (!classId) {
    const { data: enrollments, error } = await supabaseAdmin
      .from('student_class_enrollments')
      .select('class_id')
      .eq('student_id', studentId)
      .eq('status', 'ACTIVE')
      .limit(1);

    if (error) throw error;
    classId = enrollments?.[0]?.class_id || null;
  }

  if (!classId) {
    return { class_id: null, school_id: null, school_year_id: null };
  }

  const { data: classRow, error: classError } = await supabaseAdmin
    .from('classes')
    .select('school_id, school_year_id')
    .eq('id', classId)
    .maybeSingle();

  if (classError) throw classError;

  return {
    class_id: classId,
    school_id: classRow?.school_id || null,
    school_year_id: classRow?.school_year_id || null,
  };
}

async function handleGet(req: any, res: any) {
  const studentId = first(req.query?.studentId);
  const mentorId = first(req.query?.mentorId);
  const classId = first(req.query?.classId);
  const schoolId = first(req.query?.schoolId);

  let query = supabaseAdmin!.from('final_thesis').select('*');
  if (studentId) query = query.eq('student_id', studentId);
  if (mentorId) query = query.eq('mentor_id', mentorId);

  const { data, error } = await query;
  if (error) return sendDatabaseError(res, error);

  const normalized: any[] = [];

  for (const row of data || []) {
    let application = { ...row };

    if ((!application.class_id || !application.school_id) && application.student_id) {
      try {
        const context = await resolveContext(application.student_id, application.class_id);
        const repair: Record<string, any> = {};

        if (!application.class_id && context.class_id) repair.class_id = context.class_id;
        if (!application.school_id && context.school_id) repair.school_id = context.school_id;
        if (!application.school_year_id && context.school_year_id) {
          repair.school_year_id = context.school_year_id;
        }

        if (Object.keys(repair).length > 0) {
          const { error: repairError } = await supabaseAdmin!
            .from('final_thesis')
            .update({ ...repair, updated_at: new Date().toISOString() })
            .eq('id', application.id);

          if (!repairError) application = { ...application, ...repair };
        }
      } catch (repairError) {
        console.error('FINAL THESIS LEGACY REPAIR ERROR:', repairError);
      }
    }

    if (classId && application.class_id !== classId) continue;
    if (schoolId && application.school_id !== schoolId) continue;
    normalized.push(application);
  }

  normalized.sort((a, b) => {
    const bTime = new Date(b.submitted_at || b.created_at || 0).getTime();
    const aTime = new Date(a.submitted_at || a.created_at || 0).getTime();
    return bTime - aTime;
  });

  return res.status(200).json(normalized);
}

async function handlePost(req: any, res: any) {
  const incoming = parseBody(req.body);
  const missing = ['student_id', 'thesis_title', 'mentor_id', 'exam_period'].filter(
    (field) => !incoming[field]
  );

  if (missing.length > 0) {
    return res.status(400).json({ error: `Nedostaju obavezni podaci: ${missing.join(', ')}` });
  }

  const context = await resolveContext(incoming.student_id, incoming.class_id);
  if (!context.class_id || !context.school_id) {
    return res.status(400).json({
      error: 'Nije moguće odrediti aktivni razred i školu učenika.',
    });
  }

  const now = new Date().toISOString();
  const payload = sanitize({
    ...incoming,
    ...context,
    id: incoming.id || crypto.randomUUID(),
    status: 'CREATED',
    submitted_at: now,
    created_at: incoming.created_at || now,
    updated_at: now,
  });

  const { data, error } = await supabaseAdmin!
    .from('final_thesis')
    .insert(payload)
    .select()
    .single();

  if (error) return sendDatabaseError(res, error);
  return res.status(201).json({ success: true, data, db_persisted: true });
}

async function handlePut(req: any, res: any, id: string) {
  const incoming = parseBody(req.body);
  const obsoleteFields = OBSOLETE_INDIVIDUAL_DEFENSE_FIELDS.filter(
    (field) => incoming[field] !== undefined
  );

  if (obsoleteFields.length > 0) {
    return res.status(409).json({
      error: 'Pojedinačni raspored obrane više se ne sprema u prijavu završnog rada.',
      details: 'Termin, učionicu i komisiju unesite u kartici Raspored obrane za odabrani razred.',
      code: 'USE_CLASS_DEFENSE_SCHEDULE',
    });
  }

  const updates = sanitize({ ...incoming, updated_at: new Date().toISOString() });
  if (Object.keys(updates).length === 1 && updates.updated_at) {
    return res.status(400).json({ error: 'Nema podržanih podataka za spremanje.' });
  }

  const { data, error } = await supabaseAdmin!
    .from('final_thesis')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return sendDatabaseError(res, error);
  if (!data) return res.status(404).json({ error: 'Prijava završnog rada nije pronađena.' });
  return res.status(200).json({ success: true, data, db_updated: true });
}

async function handleDelete(res: any, id: string) {
  const { data, error } = await supabaseAdmin!
    .from('final_thesis')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return sendDatabaseError(res, error);
  if (!data) return res.status(404).json({ error: 'Prijava završnog rada nije pronađena.' });
  return res.status(200).json({ success: true, db_deleted: true });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Supabase admin client is not configured.' });
  }

  try {
    const id = first(req.query?.id);

    if (req.method === 'GET' && !id) return await handleGet(req, res);
    if (req.method === 'POST' && !id) return await handlePost(req, res);
    if (req.method === 'PUT' && id) return await handlePut(req, res, id);
    if (req.method === 'DELETE' && id) return await handleDelete(res, id);

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error: any) {
    console.error('FINAL THESIS API ERROR:', error);
    return res.status(500).json({
      error: error?.message || 'Neočekivana greška.',
      details: error?.details || null,
      hint: error?.hint || null,
      code: error?.code || null,
    });
  }
}
