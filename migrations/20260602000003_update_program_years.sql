-- Update metadata for duration_years
UPDATE public.programs 
SET duration_years = 3 
WHERE name ILIKE '%Kuhar%' OR name ILIKE '%Konobar%' OR name ILIKE '%Slastičar%';

UPDATE public.programs 
SET duration_years = 4 
WHERE name ILIKE '%Turističko-hotelijerski komercijalist%' OR name ILIKE '%Tehničar za ugostiteljstvo%';
