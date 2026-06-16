import { authorizeAdministrator, createOrUpdateUserFromPayload, jsonResponse } from './_user-admin.js';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { users, role, schoolId } = body;
    const auth = await authorizeAdministrator(req, schoolId);
    if (!auth.allowed) {
      return jsonResponse({ success: false, error: auth.error }, auth.status);
    }
    if (!Array.isArray(users) || users.length === 0) {
      return jsonResponse({ success: false, error: 'Lista korisnika je prazna.' }, 400);
    }

    const results = [];
    for (const user of users) {
      try {
        const result = await createOrUpdateUserFromPayload({
          ...user,
          globalRole: role,
          roles: [role],
          schoolId,
        });
        results.push({ ...user, success: true, email: result.email, password: result.password, profile: result.profile });
      } catch (error: any) {
        results.push({ ...user, success: false, error: error?.message || 'Greška pri kreiranju korisnika.' });
      }
    }

    return jsonResponse({ success: true, results, message: 'Korisnici obrađeni.' });
  } catch (error: any) {
    console.error('[BULK_CREATE_GENERAL_API]', error);
    return jsonResponse({ success: false, error: error?.message || 'Neuspjela obrada zahtjeva.' }, 500);
  }
}

export async function GET() {
  return jsonResponse({ success: false, error: 'Method Not Allowed', allowed: ['POST'] }, 405);
}
