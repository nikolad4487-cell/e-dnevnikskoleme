import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  console.log("Probing 'school_events' table...");
  const { data: eventsData, error: eventsError } = await supabase
    .from('school_events')
    .select('*')
    .limit(1);
  
  console.log("school_events Error:", eventsError);
  console.log("school_events Data:", eventsData);

  console.log("Probing 'school_calendar' table...");
  const { data: calendarData, error: calendarError } = await supabase
    .from('school_calendar')
    .select('*')
    .limit(1);
  
  console.log("school_calendar Error:", calendarError);
  console.log("school_calendar Data:", calendarData);
}
run();

