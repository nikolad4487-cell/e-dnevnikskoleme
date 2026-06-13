import { errorMessage, jsonResponse, requireAdmin } from './_helpers.js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await requireAdmin(req, body.schoolId || null);
    if (!Array.isArray(body.users) || body.users.length === 0) {
      return jsonResponse({ success: false, error: 'Popis korisnika je prazan.' }, 400);
    }

    const endpoint = new URL('/api/admin/create-user', req.url);
    const authorization = req.headers.get('authorization') || '';
    const results = [];

    for (const user of body.users) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify({
          ...user,
          globalRole: body.role,
          roles: [body.role],
          schoolId: body.schoolId,
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
        email: user.email,
        name: `${user.name || ''} ${user.surname || ''}`.trim(),
        ...(result || {}),
        success: response.ok && result?.success !== false,
      });
    }

    const failed = results.filter((result) => !result.success);
    return jsonResponse({
      success: failed.length === 0,
      results,
      error: failed.length ? `${failed.length} korisnika nije spremljeno.` : undefined,
    }, failed.length === results.length ? 500 : 200);
  } catch (error) {
    console.error('BULK CREATE USERS API ERROR', error);
    const message = errorMessage(error);
    const status = message.includes('ovlasti') || message.includes('autorizacij') ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
}
