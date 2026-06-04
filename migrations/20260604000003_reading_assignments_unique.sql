-- Remove duplicates keeping the latest one
DELETE FROM public.reading_assignments a USING (
    SELECT MAX(id) as id, school_id, school_year_id, class_id, subject_id, title, processed_at
    FROM public.reading_assignments
    GROUP BY school_id, school_year_id, class_id, subject_id, title, processed_at
    HAVING COUNT(*) > 1
) b
WHERE a.school_id = b.school_id 
AND a.class_id = b.class_id 
AND a.subject_id = b.subject_id 
AND a.title = b.title 
AND (a.school_year_id = b.school_year_id OR (a.school_year_id IS NULL AND b.school_year_id IS NULL))
AND (a.processed_at = b.processed_at OR (a.processed_at IS NULL AND b.processed_at IS NULL))
AND a.id <> b.id;

-- Add unique constraint
ALTER TABLE public.reading_assignments 
ADD CONSTRAINT reading_assignments_unique_entry 
UNIQUE(school_id, school_year_id, class_id, subject_id, title, processed_at);
