import { supabase } from './supabase';
/** Use scoped database RPCs for specialists; never a service-role legacy write. */
export async function expertPedagogicalFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = new URL(input, window.location.origin);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const read = !init?.method || init.method === 'GET';
  const value = (key: string) => body[key] ?? url.searchParams.get(key);
  const profile = url.pathname === '/api/student-pedagogical-profile';
  const keys = profile
    ? ['education_program','visit_reason','disabilities','accommodations','support_types','practical_training','documentation','program_adjustment']
    : ['recommendations','counselor_notes','yearly_observations'];
  const data = read ? null : Object.fromEntries(keys.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
  const r = await supabase.rpc('expert_pedagogy', {
    _student: value('studentId') || value('student_id'),
    _class: value('classId') || value('class_id') || null,
    _year: value('schoolYearId') || value('school_year_id') || null,
    _section: profile ? 'PROFILE' : 'YEAR', _data: data,
  });
  return new Response(JSON.stringify(r.error ? { error: r.error.message } : r.data), {
    status: r.error ? 400 : 200, headers: { 'Content-Type': 'application/json' },
  });
}
