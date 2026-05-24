-- Privremena politika za razvoj: Dopuštanje ažuriranja zapisa u user_profiles
DROP POLICY IF EXISTS "Allow authenticated update user_profiles" ON public.user_profiles;
CREATE POLICY "Allow authenticated update user_profiles"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
