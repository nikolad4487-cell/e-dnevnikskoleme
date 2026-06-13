import { errorMessage, jsonResponse, requireAdmin } from './_helpers.js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await requireAdmin(req, body.schoolId || null);
    if (!Array.isArray(body.students) || body.students.length === 0) {
      return jsonResponse({ success: false, error: 'Popis učenika je prazan.' }, 400);
    }

    const endpoint = new URL('/api/admin/create-user', req.url);
    const authorization = req.headers.get('authorization') || '';
    const results = [];

    for (const student of body.students) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify({
          email: student.email || '',
          name: student.name || '',
          surname: student.surname || '',
          globalRole: 'STUDENT',
          roles: ['STUDENT'],
          schoolId: body.schoolId,
          classId: body.classId,
          studentData: {
            classId: body.classId,
            schoolId: body.schoolId,
            programId: body.programId,
            schoolYearId: body.school_year_id,
          },
        }),
      });
      const raw = await response.text();
      let result: any = null;
      if (raw) {
        try {
          result = JSON.parse(raw);
        } catch {
          result = { success: false, error: raw };
        }
      }
      results.push({
        ...student,
        ...(result || {}),
        success: response.ok && result?.success !== false,
      });
    }

    const failed = results.filter((result) => !result.success);
    return jsonResponse({
      success: failed.length === 0,
      results,
      error: failed.length ? `${failed.length} učenika nije spremljeno.` : undefined,
    }, failed.length === results.length ? 500 : 200);
  } catch (error) {
    console.error('BULK CREATE STUDENTS API ERROR', error);
    const message = errorMessage(error);
    const status = message.includes('ovlasti') || message.includes('autorizacij') ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
}
