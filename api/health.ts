export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  let supabaseProjectHost = 'invalid-or-missing';
  try {
    supabaseProjectHost = new URL(supabaseUrl).host;
  } catch {
    // The boolean flags below provide the actionable configuration state.
  }

  return new Response(JSON.stringify({
    ok: true,
    runtimeConfig: {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
      ),
      hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      hasStaffTechnicalPassword: Boolean(process.env.STAFF_AUTH_TECHNICAL_PASSWORD),
      supabaseProjectHost
    }
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
  });
}
