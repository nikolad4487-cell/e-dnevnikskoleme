-- Existing e-Matica migration 002 bridge, unchanged; exercised by the new bulk workflow.
CREATE TYPE student_status AS ENUM ('ACTIVE','DROPPED_OUT','TRANSFERRED','GRADUATED');
CREATE TYPE enrollment_status AS ENUM ('ACTIVE','DROPPED_OUT','TRANSFERRED','GRADUATED');
CREATE TABLE ednevnik_sync_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid,school_enrollment_id uuid,ednevnik_student_id uuid,action text,status text,message text,payload jsonb);
create or replace function public.sync_registry_student_to_ednevnik_class(
  p_registry_student_id uuid,
  p_class_id text,
  p_school_enrollment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ednevnik_student_id uuid;
  v_registry_status public.student_status;
  v_class record;
  v_enrollment_id uuid;
begin
  select ednevnik_student_id, status
  into v_ednevnik_student_id, v_registry_status
  from public.registry_students
  where id = p_registry_student_id;

  if v_ednevnik_student_id is null then
    raise exception 'Ucenik prvo mora biti povezan s e-Dnevnik user_profiles zapisom.';
  end if;

  select id, school_year, school_year_id, program_id
  into v_class
  from public.classes
  where id = p_class_id;

  if v_class.id is null then
    raise exception 'Razred ne postoji: %', p_class_id;
  end if;

  select id
  into v_enrollment_id
  from public.student_class_enrollments
  where student_id = v_ednevnik_student_id
    and class_id = p_class_id
    and (
      school_year_id = v_class.school_year_id
      or school_year = v_class.school_year
    )
  limit 1;

  if v_enrollment_id is null then
    insert into public.student_class_enrollments (
      student_id,
      class_id,
      school_year,
      school_year_id,
      program_id,
      registry_student_id,
      source_school_enrollment_id,
      ematica_status,
      ednevnik_data_entry_blocked
    )
    values (
      v_ednevnik_student_id,
      p_class_id,
      v_class.school_year,
      v_class.school_year_id,
      v_class.program_id,
      p_registry_student_id,
      p_school_enrollment_id,
      case
        when v_registry_status = 'DROPPED_OUT' then 'DROPPED_OUT'::public.enrollment_status
        when v_registry_status = 'TRANSFERRED' then 'TRANSFERRED'::public.enrollment_status
        when v_registry_status = 'GRADUATED' then 'GRADUATED'::public.enrollment_status
        else 'ACTIVE'::public.enrollment_status
      end,
      v_registry_status = 'DROPPED_OUT'
    )
    returning id into v_enrollment_id;
  else
    update public.student_class_enrollments
    set registry_student_id = p_registry_student_id,
        source_school_enrollment_id = coalesce(p_school_enrollment_id, source_school_enrollment_id),
        ematica_status = case
          when v_registry_status = 'DROPPED_OUT' then 'DROPPED_OUT'::public.enrollment_status
          when v_registry_status = 'TRANSFERRED' then 'TRANSFERRED'::public.enrollment_status
          when v_registry_status = 'GRADUATED' then 'GRADUATED'::public.enrollment_status
          else 'ACTIVE'::public.enrollment_status
        end,
        ednevnik_data_entry_blocked = (v_registry_status = 'DROPPED_OUT')
    where id = v_enrollment_id;
  end if;

  update public.registry_students
  set ednevnik_synced_at = now(),
      ednevnik_data_entry_blocked = (v_registry_status = 'DROPPED_OUT'),
      updated_at = now()
  where id = p_registry_student_id;

  insert into public.ednevnik_sync_logs (
    student_id,
    school_enrollment_id,
    ednevnik_student_id,
    action,
    status,
    message,
    payload
  )
  values (
    p_registry_student_id,
    p_school_enrollment_id,
    v_ednevnik_student_id,
    'UPDATE_STUDENT',
    'SUCCESS',
    'Ucenik je sinkroniziran u e-Dnevnik razred bez dupliciranja.',
    jsonb_build_object('class_id', p_class_id, 'student_class_enrollment_id', v_enrollment_id)
  );

  return v_enrollment_id;
end;
$$;
