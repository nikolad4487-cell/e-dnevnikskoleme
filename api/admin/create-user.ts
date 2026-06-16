import { authorizeAdministrator, createOrUpdateUserFromPayload, jsonResponse } from './_user-admin.js';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log('[CREATE_USER_API] payload', body);

    const auth = await authorizeAdministrator(req, body.schoolId || body.studentData?.schoolId);
    if (!auth.allowed) {
      return jsonResponse({ success: false, error: auth.error }, auth.status);
    }

    const result = await createOrUpdateUserFromPayload(body);
    return jsonResponse(result);
  } catch (error: any) {
    console.error('[CREATE_USER_API]', error);
    return jsonResponse({ success: false, error: error?.message || 'Neuspjela obrada zahtjeva.' }, 500);
  }
}

export async function GET() {
  return jsonResponse({ success: false, error: 'Method Not Allowed', allowed: ['POST'] }, 405);
}
