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
      on usr.user_id = up.id
    where up.auth_user_id = auth.uid()
      and (
        up.role = 'SUPER_ADMIN'
        or up.access_role = 'SUPER_ADMIN'
        or (
          usr.school_id = classes.school_id
          and usr.status = 'ACTIVE'
          and usr.role in ('ADMIN', 'SCHOOL_ADMIN')
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
  exists (
    select 1
    from public.user_profiles up
    left join public.user_school_roles usr
      on usr.user_id = up.id
    where up.auth_user_id = auth.uid()
      and (
        up.role = 'SUPER_ADMIN'
        or up.access_role = 'SUPER_ADMIN'
        or (
          usr.school_id = classes.school_id
          and usr.status = 'ACTIVE'
          and usr.role in ('ADMIN', 'SCHOOL_ADMIN')
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
      on usr.user_id = up.id
    where up.auth_user_id = auth.uid()
      and (
        up.role = 'SUPER_ADMIN'
        or up.access_role = 'SUPER_ADMIN'
        or (
          usr.school_id = classes.school_id
          and usr.status = 'ACTIVE'
          and usr.role in ('ADMIN', 'SCHOOL_ADMIN')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    left join public.user_school_roles usr
      on usr.user_id = up.id
    where up.auth_user_id = auth.uid()
      and (
        up.role = 'SUPER_ADMIN'
        or up.access_role = 'SUPER_ADMIN'
        or (
          usr.school_id = classes.school_id
          and usr.status = 'ACTIVE'
          and usr.role in ('ADMIN', 'SCHOOL_ADMIN')
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
      on usr.user_id = up.id
    where up.auth_user_id = auth.uid()
      and (
        up.role = 'SUPER_ADMIN'
        or up.access_role = 'SUPER_ADMIN'
        or (
          usr.school_id = classes.school_id
          and usr.status = 'ACTIVE'
          and usr.role in ('ADMIN', 'SCHOOL_ADMIN')
        )
      )
  )
);

notify pgrst, 'reload schema';

-- Debug query if insert still fails:
-- select up.id, up.auth_user_id, up.email, up.role, up.access_role,
--        usr.school_id, usr.role as school_role, usr.status
-- from public.user_profiles up
-- left join public.user_school_roles usr
--   on usr.user_id = up.id
-- where up.email ilike '%nikola%';
