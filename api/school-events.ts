import { supabaseAdmin } from './_supabase.js';
import { errorMessage, jsonResponse, requireSchoolStaff } from './admin/_helpers.js';

function mapEvent(row: any) {
  return {
    id: row.id,
    school_id: row.school_id,
    school_year: row.school_year,
    date: row.start_date,
    time: row.start_time,
    start_date: row.start_date,
    end_date: row.end_date,
    start_time: row.start_time,
    end_time: row.end_time,
    holiday_type: row.holiday_type,
    type: row.event_type,
    title: row.title,
    notes: row.description,
    classroom: row.classroom,
    is_instructional_day: row.is_instructional_day,
  };
}

function statusForError(message: string) {
  if (message.includes('token') || message.includes('Prijava')) return 401;
  if (message.includes('ovlasti')) return 403;
  return 400;
}

export async function GET(req: Request) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');
    const schoolId = new URL(req.url).searchParams.get('schoolId');
    if (!schoolId) return jsonResponse({ success: false, error: 'Škola nije odabrana.' }, 400);

    const { data, error } = await supabaseAdmin
      .from('school_events')
      .select('*')
      .eq('school_id', schoolId)
      .order('start_date', { ascending: true });
    if (error) throw error;

    return jsonResponse((data || []).map(mapEvent));
  } catch (error) {
    console.error('SCHOOL EVENTS GET ERROR', error);
    return jsonResponse({ success: false, error: errorMessage(error) }, 400);
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');
    const body = await req.json();
    const schoolId = String(body.school_id || '').trim();
    await requireSchoolStaff(req, schoolId);

    const payload = {
      school_id: schoolId,
      school_year: body.school_year || null,
      event_type: body.event_type || body.type,
      title: String(body.title || '').trim(),
      description: body.description || body.notes || null,
      start_date: body.start_date || body.date,
      end_date: body.end_date || body.start_date || body.date,
      start_time: body.start_time || body.time || null,
      end_time: body.end_time || null,
      classroom: body.classroom || null,
      is_instructional_day: body.is_instructional_day !== false,
    };

    if (!payload.event_type || !payload.title || !payload.start_date) {
      return jsonResponse({ success: false, error: 'Vrsta, naslov i datum događaja su obavezni.' }, 400);
    }

    const query = body.id
      ? supabaseAdmin
          .from('school_events')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', body.id)
          .eq('school_id', schoolId)
      : supabaseAdmin.from('school_events').insert(payload);

    const { data, error } = await query.select().single();
    if (error) throw error;
    return jsonResponse({ success: true, data: mapEvent(data) });
  } catch (error) {
    console.error('SCHOOL EVENTS SAVE ERROR', error);
    const message = errorMessage(error);
    return jsonResponse({ success: false, error: message }, statusForError(message));
  }
}

export async function DELETE(req: Request) {
  try {
    if (!supabaseAdmin) throw new Error('Supabase Admin client nije inicijaliziran.');
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const schoolId = url.searchParams.get('schoolId') || '';
    if (!id) return jsonResponse({ success: false, error: 'ID događaja nedostaje.' }, 400);

    await requireSchoolStaff(req, schoolId);
    const { data, error } = await supabaseAdmin
      .from('school_events')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ success: false, error: 'Događaj nije pronađen.' }, 404);

    return jsonResponse({ success: true, id });
  } catch (error) {
    console.error('SCHOOL EVENTS DELETE ERROR', error);
    const message = errorMessage(error);
    return jsonResponse({ success: false, error: message }, statusForError(message));
  }
}
