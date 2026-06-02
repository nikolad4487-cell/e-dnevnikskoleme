import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(url, key);

async function run() {
  const query = `
    CREATE TABLE IF NOT EXISTS public.final_thesis_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL,
        school_id TEXT NOT NULL,
        school_year_id UUID,
        school_year TEXT,
        title TEXT NOT NULL,
        mentor_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
        exam_term TEXT NOT NULL,
        student_note TEXT,
        status TEXT DEFAULT 'CREATED',
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        accepted_at TIMESTAMPTZ,
        accepted_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
        rejected_at TIMESTAMPTZ,
        rejected_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
        rejection_note TEXT,
        application_classification_number TEXT,
        application_registry_number TEXT,
        application_data_entered_at TIMESTAMPTZ,
        application_data_entered_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
        deregistered_at TIMESTAMPTZ,
        deregistration_note TEXT,
        deregistration_classification_number TEXT,
        deregistration_registry_number TEXT,
        deregistration_data_entered_at TIMESTAMPTZ,
        deregistration_data_entered_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE public.final_thesis_applications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Manage actions final_thesis_applications" ON public.final_thesis_applications FOR ALL TO authenticated USING (true);
  `;
  try {
    const { data, error } = await supabase.rpc("exec_sql", { query });
    console.log("exec_sql RESULT:", { data, error });
  } catch (err: any) {
    console.error("exec_sql FAILED Exception:", err.message);
  }
}
run();
