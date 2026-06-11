CREATE TABLE IF NOT EXISTS public.school_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id text NOT NULL,
  school_year text,
  date date NOT NULL,
  week integer,
  time text,
  type text NOT NULL, -- 'PRAZNIK' | 'SJEDNICA' | 'SASTANAK' | 'OBRANA' | 'NATJECANJE' | 'IZLET' | 'DOGAĐAJ' | 'ŠKOLSKI_PRAZNIK'
  title text NOT NULL,
  reason text,
  classroom text,
  commission text,
  notes text,
  start_date date,
  end_date date,
  start_time text,
  end_time text,
  holiday_type text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users
DROP POLICY IF EXISTS "school_events_select" ON public.school_events;
CREATE POLICY "school_events_select"
ON public.school_events
FOR SELECT
TO authenticated
USING (true);

-- Allow insert, update, delete for authenticated users (including admin)
DROP POLICY IF EXISTS "school_events_insert" ON public.school_events;
CREATE POLICY "school_events_insert"
ON public.school_events
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "school_events_update" ON public.school_events;
CREATE POLICY "school_events_update"
ON public.school_events
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "school_events_delete" ON public.school_events;
CREATE POLICY "school_events_delete"
ON public.school_events
FOR DELETE
TO authenticated
USING (true);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
