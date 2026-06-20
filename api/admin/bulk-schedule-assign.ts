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

    if (classId == null || dayOfWeek == null || shift == null || startPeriod == null || consecutivePeriods == null || subjectId == null) {
      return new Response(JSON.stringify({ success: false, error: "Missing required parameters." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const start = Number(startPeriod);
    const count = Number(consecutivePeriods);
    const end = start + count - 1;

    // Validate period numbers
    if (isNaN(start) || isNaN(count) || start < 0 || count < 1) {
      return new Response(JSON.stringify({ success: false, error: "Invalid start period or consecutive periods count." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Assign each consecutive period
    for (let p = start; p <= end; p++) {
      // 1. Upsert or find schedule_cell
      const { data: cell, error: cellErr } = await supabaseAdmin
        .from('schedule_cells')
        .upsert({
          class_id: classId,
          day_of_week: dayOfWeek,
          shift: shift,
          period_number: p
        }, {
          onConflict: 'class_id,day_of_week,shift,period_number'
        })
        .select()
        .maybeSingle();

      if (cellErr || !cell) {
        throw new Error(cellErr?.message || `Neuspjelo kreiranje ćelije za period ${p}`);
      }

      // 2. Insert new schedule_cell_subjects
      const { error: insErr } = await supabaseAdmin
        .from('schedule_cell_subjects')
        .insert({
          schedule_cell_id: cell.id,
          subject_id: subjectId,
          teacher_id: teacherId || null,
          classroom: classroom || null
        });

      if (insErr) {
        throw insErr;
      }
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

    // Find all schedule_cells for this class, day and shift
    const { data: cells, error: cellsErr } = await supabaseAdmin
      .from('schedule_cells')
      .select('id')
      .eq('class_id', classId)
      .eq('day_of_week', dayOfWeek)
      .eq('shift', shift);

    if (cellsErr) {
      throw cellsErr;
    }

    if (cells && cells.length > 0) {
      const cellIds = cells.map((c: any) => c.id);

      // Delete subject assignments matching this subjectId in these cells
      const { error: delErr } = await supabaseAdmin
        .from('schedule_cell_subjects')
        .delete()
        .in('schedule_cell_id', cellIds)
        .eq('subject_id', subjectId);

      if (delErr) {
        throw delErr;
      }
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
