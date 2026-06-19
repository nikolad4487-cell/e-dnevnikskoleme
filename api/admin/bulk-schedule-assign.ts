import { supabaseAdmin } from '../_supabase.js';

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Supabase Admin client is not initialized." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { 
      classId, 
      dayOfWeek, 
      shift, 
      startPeriod, 
      consecutivePeriods, 
      subjectId, 
      teacherId, 
      classroom 
    } = body;

    if (!classId || !dayOfWeek || !shift || !startPeriod || !consecutivePeriods || !subjectId || !teacherId) {
      return new Response(JSON.stringify({ success: false, error: "Missing required parameters." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const start = Number(startPeriod);
    const count = Number(consecutivePeriods);
    const end = start + count - 1;

    // Validate period numbers
    if (isNaN(start) || isNaN(count) || start < 1 || count < 1) {
      return new Response(JSON.stringify({ success: false, error: "Invalid start period or consecutive periods count." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // construct transactional plpgsql block to execute via exec_sql
    const escapedClassId = classId.replace(/'/g, "''");
    const escapedSubjectId = subjectId.replace(/'/g, "''");
    const escapedTeacherId = teacherId.replace(/'/g, "''");
    const escapedDayOfWeek = dayOfWeek.replace(/'/g, "''");
    const escapedShift = shift.replace(/'/g, "''");
    const escapedClassroom = classroom ? `'${classroom.replace(/'/g, "''")}'` : 'NULL';

    const sql = `
DO $$
DECLARE
  cell_id uuid;
  assigned_subject_id text := '${escapedSubjectId}';
  assigned_teacher_id uuid := '${escapedTeacherId}';
  assigned_class_id text := '${escapedClassId}';
  day text := '${escapedDayOfWeek}';
  sh text := '${escapedShift}';
  classroom_val text := ${escapedClassroom};
  p_num integer;
BEGIN
  FOR p_num IN ${start}..${end} LOOP
    -- Insert cell if not exists, and get id
    INSERT INTO public.schedule_cells (class_id, day_of_week, shift, period_number)
    VALUES (assigned_class_id, day, sh, p_num)
    ON CONFLICT (class_id, day_of_week, shift, period_number) 
    DO UPDATE SET updated_at = NOW()
    RETURNING id INTO cell_id;

    -- Delete existing subjects from schedule_cell_subjects for this cell to avoid duplicate key conflicts
    DELETE FROM public.schedule_cell_subjects WHERE schedule_cell_id = cell_id;

    -- Insert new subject
    INSERT INTO public.schedule_cell_subjects (schedule_cell_id, subject_id, teacher_id, classroom)
    VALUES (cell_id, assigned_subject_id, assigned_teacher_id, classroom_val);
  END LOOP;
END;
$$;
`;

    const { error: rpcError } = await supabaseAdmin.rpc('exec_sql', { query: sql });
    
    if (rpcError) {
      console.error("[BULK_SCHEDULE_ASSIGN_API] Database error:", rpcError);
      return new Response(JSON.stringify({ success: false, error: `Problem kod spremanja u bazu: ${rpcError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Raspored je uspješno kreiran u bloku." }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[BULK_SCHEDULE_ASSIGN_API] Exception:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Supabase Admin client is not initialized." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId');
    const dayOfWeek = searchParams.get('dayOfWeek');
    const shift = searchParams.get('shift');
    const subjectId = searchParams.get('subjectId');

    if (!classId || !dayOfWeek || !shift || !subjectId) {
      return new Response(JSON.stringify({ success: false, error: "Missing required query parameters." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const escapedClassId = classId.replace(/'/g, "''");
    const escapedSubjectId = subjectId.replace(/'/g, "''");
    const escapedDayOfWeek = dayOfWeek.replace(/'/g, "''");
    const escapedShift = shift.replace(/'/g, "''");

    const sql = `
DELETE FROM public.schedule_cell_subjects
WHERE subject_id = '${escapedSubjectId}'
  AND schedule_cell_id IN (
    SELECT id FROM public.schedule_cells
    WHERE class_id = '${escapedClassId}'
      AND day_of_week = '${escapedDayOfWeek}'
      AND shift = '${escapedShift}'
  );
`;

    const { error: rpcError } = await supabaseAdmin.rpc('exec_sql', { query: sql });
    
    if (rpcError) {
      console.error("[BULK_SCHEDULE_DELETE_API] Database error:", rpcError);
      return new Response(JSON.stringify({ success: false, error: `Problem kod brisanja bloka: ${rpcError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Cijeli blok predmeta je uspješno obrisan." }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[BULK_SCHEDULE_DELETE_API] Exception:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
