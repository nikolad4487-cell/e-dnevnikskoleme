import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("DEBUG [AUTH]: SUPABASE URL", supabaseUrl);
console.log("DEBUG [AUTH]: HAS ANON KEY", !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR [AUTH]: Supabase URL or Anon Key is missing! Variables:', {
    url: supabaseUrl,
    hasKey: !!supabaseAnonKey
  });
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
    storageKey: 'sb-auth-system-v1',
    flowType: 'pkce'
  }
});
