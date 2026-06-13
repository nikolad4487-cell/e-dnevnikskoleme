import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL as string, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string);

async function checkColumn() {
    const { data, error } = await supabaseAdmin.from('user_profiles').select('pin_hash').limit(1);
    if (error) {
        console.log("Column likely does NOT exist:", error.message);
    } else {
        console.log("Column exists!", data);
    }
}
checkColumn();
