drop policy if exists "Authenticated manage classes"
on public.classes;

drop policy if exists "Admins can read classes"
on public.classes;

create policy "Admins can read classes"
on public.classes
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    left join public.user_school_roles usr
      on usr.user_id::text = up.id::text
    where up.auth_user_id::text = auth.uid()::text
      and (
        upper(coalesce(up.role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or upper(coalesce(up.access_role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or (
          usr.school_id::text = classes.school_id::text
          and upper(coalesce(usr.status::text, 'ACTIVE')) = 'ACTIVE'
          and upper(coalesce(usr.role::text, '')) in ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'MAIN_ADMIN')
        )
      )
  )
);

drop policy if exists "Admins can insert classes"
on public.classes;

create policy "Admins can insert classes"
on public.classes
for insert
to authenticated
with check (
  school_id is not null
  and exists (
    select 1
    from public.user_profiles up
    left join public.user_school_roles usr
      on usr.user_id::text = up.id::text
    where up.auth_user_id::text = auth.uid()::text
      and (
        upper(coalesce(up.role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or upper(coalesce(up.access_role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or (
          usr.school_id::text = classes.school_id::text
          and upper(coalesce(usr.status::text, 'ACTIVE')) = 'ACTIVE'
          and upper(coalesce(usr.role::text, '')) in ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'MAIN_ADMIN')
        )
      )
  )
);

drop policy if exists "Admins can update classes"
on public.classes;

create policy "Admins can update classes"
on public.classes
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    left join public.user_school_roles usr
      on usr.user_id::text = up.id::text
    where up.auth_user_id::text = auth.uid()::text
      and (
        upper(coalesce(up.role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or upper(coalesce(up.access_role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or (
          usr.school_id::text = classes.school_id::text
          and upper(coalesce(usr.status::text, 'ACTIVE')) = 'ACTIVE'
          and upper(coalesce(usr.role::text, '')) in ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'MAIN_ADMIN')
        )
      )
  )
)
with check (
  school_id is not null
  and exists (
    select 1
    from public.user_profiles up
    left join public.user_school_roles usr
      on usr.user_id::text = up.id::text
    where up.auth_user_id::text = auth.uid()::text
      and (
        upper(coalesce(up.role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or upper(coalesce(up.access_role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or (
          usr.school_id::text = classes.school_id::text
          and upper(coalesce(usr.status::text, 'ACTIVE')) = 'ACTIVE'
          and upper(coalesce(usr.role::text, '')) in ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'MAIN_ADMIN')
        )
      )
  )
);

drop policy if exists "Admins can delete classes"
on public.classes;

create policy "Admins can delete classes"
on public.classes
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    left join public.user_school_roles usr
      on usr.user_id::text = up.id::text
    where up.auth_user_id::text = auth.uid()::text
      and (
        upper(coalesce(up.role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or upper(coalesce(up.access_role::text, '')) in ('SUPER_ADMIN', 'MAIN_ADMIN')
        or (
          usr.school_id::text = classes.school_id::text
          and upper(coalesce(usr.status::text, 'ACTIVE')) = 'ACTIVE'
          and upper(coalesce(usr.role::text, '')) in ('ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'MAIN_ADMIN')
        )
      )
  )
);

notify pgrst, 'reload schema';

-- If insert still fails, run:
-- select up.id, up.auth_user_id, up.email, up.role, up.access_role,
--        usr.school_id, usr.role as school_role, usr.status
-- from public.user_profiles up
-- left join public.user_school_roles usr
--   on usr.user_id = up.id
-- where up.email ilike '%nikola%';

