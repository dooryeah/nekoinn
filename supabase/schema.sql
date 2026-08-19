create extension if not exists pgcrypto;

create table if not exists public.member_whitelist (
    email text primary key,
    email_normalized text generated always as (lower(email)) stored unique,
    nickname text,
    minecraft_name text,
    role text not null default 'member',
    avatar_url text,
    signature text,
    background_path text,
    experience_points integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

alter table public.member_whitelist
    add column if not exists signature text,
    add column if not exists background_path text,
    add column if not exists experience_points integer not null default 0;

update public.member_whitelist
set experience_points = 0
where experience_points is null;

alter table public.member_whitelist
    alter column experience_points set default 0,
    alter column experience_points set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'member_whitelist_signature_length'
        and conrelid = 'public.member_whitelist'::regclass
    ) then
        alter table public.member_whitelist
            add constraint member_whitelist_signature_length
            check (signature is null or char_length(signature) <= 80);
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'member_whitelist_experience_nonnegative'
        and conrelid = 'public.member_whitelist'::regclass
    ) then
        alter table public.member_whitelist
            add constraint member_whitelist_experience_nonnegative
            check (experience_points >= 0);
    end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'member-backgrounds',
    'member-backgrounds',
    true,
    4194304,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.member_checkins (
    id uuid primary key default gen_random_uuid(),
    email_normalized text not null,
    checkin_date date not null default ((timezone('Asia/Shanghai', now()))::date),
    created_at timestamptz not null default now(),
    unique (email_normalized, checkin_date)
);

create table if not exists public.member_wishes (
    id uuid primary key default gen_random_uuid(),
    email_normalized text not null,
    wish_date date not null default ((timezone('Asia/Shanghai', now()))::date),
    gained_experience integer not null,
    created_at timestamptz not null default now(),
    unique (email_normalized, wish_date),
    check (gained_experience between 1 and 5)
);

create table if not exists public.site_quotes (
    id uuid primary key default gen_random_uuid(),
    quote_text text not null,
    author_name text,
    source_user_id text,
    source_group_id text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    check (char_length(btrim(quote_text)) between 1 and 120),
    check (author_name is null or char_length(author_name) <= 32)
);

create index if not exists member_whitelist_active_email_idx
    on public.member_whitelist (email_normalized)
    where is_active;

create index if not exists member_checkins_rank_idx
    on public.member_checkins (email_normalized, checkin_date desc);

create index if not exists member_wishes_daily_idx
    on public.member_wishes (email_normalized, wish_date desc);

create index if not exists site_quotes_active_created_idx
    on public.site_quotes (is_active, created_at desc);

update public.member_whitelist mw
set experience_points = greatest(mw.experience_points, coalesce(totals.checkin_count, 0) * 5)
from (
    select
        mc.email_normalized,
        count(*)::integer as checkin_count
    from public.member_checkins mc
    group by mc.email_normalized
) totals
where mw.email_normalized = totals.email_normalized;

alter table public.member_whitelist enable row level security;
alter table public.member_checkins enable row level security;
alter table public.member_wishes enable row level security;
alter table public.site_quotes enable row level security;

drop policy if exists "members can read own whitelist row" on public.member_whitelist;
create policy "members can read own whitelist row"
on public.member_whitelist
for select
to authenticated
using (
    is_active
    and email_normalized = lower(auth.jwt() ->> 'email')
);

drop policy if exists "whitelisted members can read checkins" on public.member_checkins;
create policy "whitelisted members can read checkins"
on public.member_checkins
for select
to authenticated
using (
    exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = lower(auth.jwt() ->> 'email')
    )
);

drop policy if exists "whitelisted members can read own wishes" on public.member_wishes;
create policy "whitelisted members can read own wishes"
on public.member_wishes
for select
to authenticated
using (
    email_normalized = lower(auth.jwt() ->> 'email')
    and exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = lower(auth.jwt() ->> 'email')
    )
);

drop policy if exists "anyone can read active site quotes" on public.site_quotes;
create policy "anyone can read active site quotes"
on public.site_quotes
for select
to anon, authenticated
using (is_active);

drop policy if exists "members can insert own daily checkin" on public.member_checkins;
create policy "members can insert own daily checkin"
on public.member_checkins
for insert
to authenticated
with check (
    email_normalized = lower(auth.jwt() ->> 'email')
    and checkin_date = ((timezone('Asia/Shanghai', now()))::date)
    and exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = lower(auth.jwt() ->> 'email')
    )
);

drop policy if exists "members can upload own backgrounds" on storage.objects;
create policy "members can upload own backgrounds"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'member-backgrounds'
    and (storage.foldername(name))[1] = lower(auth.jwt() ->> 'email')
    and exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = lower(auth.jwt() ->> 'email')
    )
);

drop policy if exists "members can read own background records" on storage.objects;
create policy "members can read own background records"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'member-backgrounds'
    and (storage.foldername(name))[1] = lower(auth.jwt() ->> 'email')
    and exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = lower(auth.jwt() ->> 'email')
    )
);

drop policy if exists "members can delete own backgrounds" on storage.objects;
create policy "members can delete own backgrounds"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'member-backgrounds'
    and (storage.foldername(name))[1] = lower(auth.jwt() ->> 'email')
    and exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = lower(auth.jwt() ->> 'email')
    )
);

grant usage on schema public to authenticated;
grant select on public.member_whitelist to authenticated;
revoke all on public.member_checkins from anon, authenticated;
revoke all on public.member_wishes from anon, authenticated;
revoke all on public.site_quotes from anon, authenticated;
grant select on public.site_quotes to anon, authenticated;
grant insert, select, update on public.site_quotes to service_role;

drop function if exists public.get_my_checkin_status();

create or replace function public.get_my_checkin_status()
returns table (
    checked_in_today boolean,
    total_count bigint,
    checked_at timestamptz,
    experience_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_email text := lower(auth.jwt() ->> 'email');
    today date := ((timezone('Asia/Shanghai', now()))::date);
begin
    if current_email is null or not exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = current_email
    ) then
        raise exception 'not_whitelisted';
    end if;

    return query
    select
        exists (
            select 1
            from public.member_checkins mc
            where mc.email_normalized = current_email
            and mc.checkin_date = today
        ) as checked_in_today,
        count(mc.id)::bigint as total_count,
        max(mc.created_at) as checked_at,
        mw.experience_points
    from public.member_checkins mc
    right join public.member_whitelist mw
        on mw.email_normalized = current_email
        and mc.email_normalized = mw.email_normalized
    where mw.is_active
    and mw.email_normalized = current_email
    group by mw.experience_points;
end;
$$;

drop function if exists public.check_in_member();

create or replace function public.check_in_member()
returns table (
    checked_in_today boolean,
    total_count bigint,
    checked_at timestamptz,
    experience_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_email text := lower(auth.jwt() ->> 'email');
    today date := ((timezone('Asia/Shanghai', now()))::date);
    inserted_count integer := 0;
begin
    if current_email is null or not exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = current_email
    ) then
        raise exception 'not_whitelisted';
    end if;

    insert into public.member_checkins (email_normalized, checkin_date)
    values (current_email, today)
    on conflict (email_normalized, checkin_date) do nothing;

    get diagnostics inserted_count = row_count;

    if inserted_count > 0 then
        update public.member_whitelist mw
        set experience_points = mw.experience_points + 5
        where mw.is_active
        and mw.email_normalized = current_email;
    end if;

    return query
    select
        exists (
            select 1
            from public.member_checkins mc
            where mc.email_normalized = current_email
            and mc.checkin_date = today
        ) as checked_in_today,
        count(mc.id)::bigint as total_count,
        max(mc.created_at) as checked_at,
        mw.experience_points
    from public.member_checkins mc
    right join public.member_whitelist mw
        on mw.email_normalized = current_email
        and mc.email_normalized = mw.email_normalized
    where mw.is_active
    and mw.email_normalized = current_email
    group by mw.experience_points;
end;
$$;

drop function if exists public.bot_check_in_member(text);

create or replace function public.bot_check_in_member(member_email text)
returns table (
    display_name text,
    email text,
    minecraft_name text,
    checked_in_today boolean,
    already_checked boolean,
    total_count bigint,
    checked_at timestamptz,
    signed_date date,
    experience_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_email text := lower(btrim(coalesce(member_email, '')));
    today date := ((timezone('Asia/Shanghai', now()))::date);
    inserted_count integer := 0;
begin
    if current_email = '' or current_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'invalid_email';
    end if;

    if not exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = current_email
    ) then
        raise exception 'not_whitelisted';
    end if;

    insert into public.member_checkins (email_normalized, checkin_date)
    values (current_email, today)
    on conflict on constraint member_checkins_email_normalized_checkin_date_key do nothing;

    get diagnostics inserted_count = row_count;

    if inserted_count > 0 then
        update public.member_whitelist mw
        set experience_points = mw.experience_points + 5
        where mw.is_active
        and mw.email_normalized = current_email;
    end if;

    return query
    select
        coalesce(nullif(mw.nickname, ''), nullif(mw.minecraft_name, ''), '成员') as display_name,
        mw.email,
        mw.minecraft_name,
        exists (
            select 1
            from public.member_checkins today_checkin
            where today_checkin.email_normalized = current_email
            and today_checkin.checkin_date = today
        ) as checked_in_today,
        inserted_count = 0 as already_checked,
        count(mc.id)::bigint as total_count,
        max(mc.created_at) as checked_at,
        today as signed_date,
        mw.experience_points
    from public.member_whitelist mw
    left join public.member_checkins mc
        on mc.email_normalized = mw.email_normalized
    where mw.is_active
    and mw.email_normalized = current_email
    group by mw.email, mw.nickname, mw.minecraft_name, mw.experience_points;
end;
$$;

drop function if exists public.bot_wish_member(text);

create or replace function public.bot_wish_member(member_email text)
returns table (
    display_name text,
    email text,
    minecraft_name text,
    gained_experience integer,
    experience_points integer,
    already_wished boolean,
    wished_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_email text := lower(btrim(coalesce(member_email, '')));
    today date := ((timezone('Asia/Shanghai', now()))::date);
    gained integer := floor(random() * 5 + 1)::integer;
    inserted_count integer := 0;
begin
    if current_email = '' or current_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'invalid_email';
    end if;

    if not exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = current_email
    ) then
        raise exception 'not_whitelisted';
    end if;

    insert into public.member_wishes (email_normalized, wish_date, gained_experience)
    values (current_email, today, gained)
    on conflict on constraint member_wishes_email_normalized_wish_date_key do nothing;

    get diagnostics inserted_count = row_count;

    if inserted_count > 0 then
        return query
        update public.member_whitelist mw
        set experience_points = mw.experience_points + gained
        where mw.is_active
        and mw.email_normalized = current_email
        returning
            coalesce(nullif(mw.nickname, ''), nullif(mw.minecraft_name, ''), '成员') as display_name,
            mw.email,
            mw.minecraft_name,
            gained as gained_experience,
            mw.experience_points,
            false as already_wished,
            today as wished_date;
        return;
    end if;

    return query
    select
        coalesce(nullif(mw.nickname, ''), nullif(mw.minecraft_name, ''), '成员') as display_name,
        mw.email,
        mw.minecraft_name,
        coalesce(w.gained_experience, 0) as gained_experience,
        mw.experience_points,
        true as already_wished,
        today as wished_date
    from public.member_whitelist mw
    left join public.member_wishes w
        on w.email_normalized = mw.email_normalized
        and w.wish_date = today
    where mw.is_active
    and mw.email_normalized = current_email;
end;
$$;

create or replace function public.update_my_profile(
    new_signature text default null,
    new_background_path text default null
)
returns table (
    signature text,
    background_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_email text := lower(auth.jwt() ->> 'email');
    normalized_signature text := nullif(btrim(coalesce(new_signature, '')), '');
    normalized_background_path text := nullif(btrim(coalesce(new_background_path, '')), '');
begin
    if current_email is null or not exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = current_email
    ) then
        raise exception 'not_whitelisted';
    end if;

    if normalized_signature is not null and char_length(normalized_signature) > 80 then
        raise exception 'signature_too_long';
    end if;

    if normalized_background_path is not null
        and split_part(normalized_background_path, '/', 1) <> current_email then
        raise exception 'invalid_background_path';
    end if;

    return query
    update public.member_whitelist mw
    set
        signature = normalized_signature,
        background_path = normalized_background_path
    where mw.is_active
    and mw.email_normalized = current_email
    returning mw.signature, mw.background_path;
end;
$$;

drop function if exists public.get_checkin_leaderboard(integer);

create or replace function public.get_checkin_leaderboard(limit_count integer default 30)
returns table (
    rank_position bigint,
    display_name text,
    email text,
    minecraft_name text,
    avatar_url text,
    total_count bigint,
    last_checkin_date date,
    checked_in_today boolean,
    experience_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_email text := lower(auth.jwt() ->> 'email');
    today date := ((timezone('Asia/Shanghai', now()))::date);
    result_limit integer := greatest(1, least(coalesce(limit_count, 30), 100));
begin
    if current_email is null or not exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = current_email
    ) then
        raise exception 'not_whitelisted';
    end if;

    return query
    with totals as (
        select
            mw.email,
            coalesce(nullif(mw.nickname, ''), nullif(mw.minecraft_name, ''), mw.email) as display_name,
            mw.minecraft_name,
            mw.avatar_url,
            mw.experience_points,
            count(mc.id)::bigint as total_count,
            max(mc.checkin_date) as last_checkin_date,
            bool_or(mc.checkin_date = today) as checked_in_today
        from public.member_checkins mc
        join public.member_whitelist mw
            on mw.email_normalized = mc.email_normalized
        where mw.is_active
        group by mw.email, mw.nickname, mw.minecraft_name, mw.avatar_url, mw.experience_points
    )
    select
        row_number() over (
            order by totals.total_count desc, totals.last_checkin_date desc nulls last, totals.display_name asc
        ) as rank_position,
        totals.display_name,
        totals.email,
        totals.minecraft_name,
        totals.avatar_url,
        totals.total_count,
        totals.last_checkin_date,
        coalesce(totals.checked_in_today, false) as checked_in_today,
        totals.experience_points
    from totals
    order by totals.total_count desc, totals.last_checkin_date desc nulls last, totals.display_name asc
    limit result_limit;
end;
$$;

drop function if exists public.get_member_public_profile(text);

create or replace function public.get_member_public_profile(player_name text)
returns table (
    display_name text,
    minecraft_name text,
    role text,
    avatar_url text,
    signature text,
    background_path text,
    total_count bigint,
    last_checkin_date date,
    checked_in_today boolean,
    experience_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    current_email text := lower(auth.jwt() ->> 'email');
    target_player text := lower(btrim(coalesce(player_name, '')));
    today date := ((timezone('Asia/Shanghai', now()))::date);
begin
    if current_email is null or not exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = current_email
    ) then
        raise exception 'not_whitelisted';
    end if;

    if target_player = '' then
        return;
    end if;

    return query
    select
        coalesce(nullif(mw.nickname, ''), nullif(mw.minecraft_name, ''), '成员') as display_name,
        mw.minecraft_name,
        mw.role,
        mw.avatar_url,
        mw.signature,
        mw.background_path,
        count(mc.id)::bigint as total_count,
        max(mc.checkin_date) as last_checkin_date,
        coalesce(bool_or(mc.checkin_date = today), false) as checked_in_today,
        mw.experience_points
    from public.member_whitelist mw
    left join public.member_checkins mc
        on mc.email_normalized = mw.email_normalized
    where mw.is_active
    and (
        lower(coalesce(mw.minecraft_name, '')) = target_player
        or lower(coalesce(mw.nickname, '')) = target_player
    )
    group by mw.email_normalized, mw.nickname, mw.minecraft_name, mw.role, mw.avatar_url, mw.signature, mw.background_path, mw.experience_points
    order by
        case when lower(coalesce(mw.minecraft_name, '')) = target_player then 0 else 1 end,
        coalesce(nullif(mw.nickname, ''), nullif(mw.minecraft_name, ''), '成员') asc
    limit 1;
end;
$$;

drop function if exists public.get_bot_member_card(text);

create or replace function public.get_bot_member_card(player_name text)
returns table (
    display_name text,
    minecraft_name text,
    role text,
    avatar_url text,
    signature text,
    background_path text,
    total_count bigint,
    last_checkin_date date,
    checked_in_today boolean,
    experience_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    target_player text := lower(btrim(coalesce(player_name, '')));
    today date := ((timezone('Asia/Shanghai', now()))::date);
begin
    if target_player = '' then
        return;
    end if;

    return query
    select
        coalesce(nullif(mw.nickname, ''), nullif(mw.minecraft_name, ''), '成员') as display_name,
        mw.minecraft_name,
        mw.role,
        mw.avatar_url,
        mw.signature,
        mw.background_path,
        count(mc.id)::bigint as total_count,
        max(mc.checkin_date) as last_checkin_date,
        coalesce(bool_or(mc.checkin_date = today), false) as checked_in_today,
        mw.experience_points
    from public.member_whitelist mw
    left join public.member_checkins mc
        on mc.email_normalized = mw.email_normalized
    where mw.is_active
    and (
        lower(coalesce(mw.minecraft_name, '')) = target_player
        or lower(coalesce(mw.nickname, '')) = target_player
    )
    group by mw.email_normalized, mw.nickname, mw.minecraft_name, mw.role, mw.avatar_url, mw.signature, mw.background_path, mw.experience_points
    order by
        case when lower(coalesce(mw.minecraft_name, '')) = target_player then 0 else 1 end,
        coalesce(nullif(mw.nickname, ''), nullif(mw.minecraft_name, ''), '成员') asc
    limit 1;
end;
$$;

revoke all on function public.get_my_checkin_status() from public;
revoke all on function public.check_in_member() from public;
revoke all on function public.update_my_profile(text, text) from public;
revoke all on function public.get_checkin_leaderboard(integer) from public;
revoke all on function public.get_member_public_profile(text) from public;
revoke all on function public.get_bot_member_card(text) from public;
revoke all on function public.bot_check_in_member(text) from public;
revoke all on function public.bot_wish_member(text) from public;

grant execute on function public.get_my_checkin_status() to authenticated;
grant execute on function public.check_in_member() to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.get_checkin_leaderboard(integer) to authenticated;
grant execute on function public.get_member_public_profile(text) to authenticated;
grant execute on function public.get_bot_member_card(text) to service_role;
grant execute on function public.bot_check_in_member(text) to service_role;
grant execute on function public.bot_wish_member(text) to service_role;

-- ============================================================
-- 站点内容管理（admin 页）：工程项目 / 服务器展览 / 投影文件
-- ============================================================

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    image text not null default '',
    dimension text not null default '主世界',
    type text not null default '机器',
    author text not null default '',
    description text not null default '',
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.exhibition_items (
    id uuid primary key default gen_random_uuid(),
    image text not null,
    title text,
    description text,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.projection_files (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    url text not null,
    note text,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.site_admins (
    user_id uuid primary key,
    created_at timestamptz not null default now()
);

create index if not exists projects_active_sort_idx
    on public.projects (is_active, sort_order, created_at);

create index if not exists exhibition_items_active_sort_idx
    on public.exhibition_items (is_active, sort_order, created_at);

create index if not exists projection_files_active_sort_idx
    on public.projection_files (is_active, sort_order, created_at);

alter table public.projects enable row level security;
alter table public.exhibition_items enable row level security;
alter table public.projection_files enable row level security;
alter table public.site_admins enable row level security;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.site_admins
        where user_id = auth.uid()
    );
$$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated;

revoke all on public.projects from anon, authenticated;
revoke all on public.exhibition_items from anon, authenticated;
revoke all on public.projection_files from anon, authenticated;
revoke all on public.site_admins from anon, authenticated;

grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant select on public.exhibition_items to anon, authenticated;
grant insert, update, delete on public.exhibition_items to authenticated;
grant select on public.projection_files to anon, authenticated;
grant insert, update, delete on public.projection_files to authenticated;
grant select, insert, delete on public.site_admins to service_role;

drop policy if exists "public can read active projects" on public.projects;
create policy "public can read active projects"
on public.projects for select
to anon, authenticated
using (is_active);

drop policy if exists "admin can read all projects" on public.projects;
create policy "admin can read all projects"
on public.projects for select
to authenticated
using (public.is_site_admin());

drop policy if exists "admin can insert projects" on public.projects;
create policy "admin can insert projects"
on public.projects for insert
to authenticated
with check (public.is_site_admin());

drop policy if exists "admin can update projects" on public.projects;
create policy "admin can update projects"
on public.projects for update
to authenticated
using (public.is_site_admin());

drop policy if exists "admin can delete projects" on public.projects;
create policy "admin can delete projects"
on public.projects for delete
to authenticated
using (public.is_site_admin());

drop policy if exists "public can read active exhibition items" on public.exhibition_items;
create policy "public can read active exhibition items"
on public.exhibition_items for select
to anon, authenticated
using (is_active);

drop policy if exists "admin can read all exhibition items" on public.exhibition_items;
create policy "admin can read all exhibition items"
on public.exhibition_items for select
to authenticated
using (public.is_site_admin());

drop policy if exists "admin can insert exhibition items" on public.exhibition_items;
create policy "admin can insert exhibition items"
on public.exhibition_items for insert
to authenticated
with check (public.is_site_admin());

drop policy if exists "admin can update exhibition items" on public.exhibition_items;
create policy "admin can update exhibition items"
on public.exhibition_items for update
to authenticated
using (public.is_site_admin());

drop policy if exists "admin can delete exhibition items" on public.exhibition_items;
create policy "admin can delete exhibition items"
on public.exhibition_items for delete
to authenticated
using (public.is_site_admin());

drop policy if exists "public can read active projection files" on public.projection_files;
create policy "public can read active projection files"
on public.projection_files for select
to anon, authenticated
using (is_active);

drop policy if exists "admin can read all projection files" on public.projection_files;
create policy "admin can read all projection files"
on public.projection_files for select
to authenticated
using (public.is_site_admin());

drop policy if exists "admin can insert projection files" on public.projection_files;
create policy "admin can insert projection files"
on public.projection_files for insert
to authenticated
with check (public.is_site_admin());

drop policy if exists "admin can update projection files" on public.projection_files;
create policy "admin can update projection files"
on public.projection_files for update
to authenticated
using (public.is_site_admin());

drop policy if exists "admin can delete projection files" on public.projection_files;
create policy "admin can delete projection files"
on public.projection_files for delete
to authenticated
using (public.is_site_admin());

-- 管理页上传的图片/文件统一放在公开 bucket site-media
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'site-media',
    'site-media',
    true,
    8388608,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin can upload site media" on storage.objects;
create policy "admin can upload site media"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'site-media'
    and public.is_site_admin()
);

drop policy if exists "admin can update site media" on storage.objects;
create policy "admin can update site media"
on storage.objects for update
to authenticated
using (
    bucket_id = 'site-media'
    and public.is_site_admin()
);

drop policy if exists "admin can delete site media" on storage.objects;
create policy "admin can delete site media"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'site-media'
    and public.is_site_admin()
);

-- 首次迁移：把现有静态数据灌入数据库（仅当对应表为空时）
do $$
begin
    if not exists (select 1 from public.projects) then
        insert into public.projects (name, image, dimension, type, author, description, sort_order) values
        ('16核心刷铁机', './images/projects/iron_farm.png', '主世界', '机器', '孟乃&九日&un_vagrant&everynum', '挂个假人即可', 1),
        ('大型村民交易所', './images/projects/大型村民交易所.png', '主世界', '机器', '孟乃&un_vagrant&伊凛&很多很多人', '打折机有点慢，多等一会就好了<br>孩子们，绿宝石自由了喵', 2),
        ('小型自动酿造机', './images/projects/小型自动酿造机.png', '主世界', '机器', '孟乃&伊凛', '可以自动酿造虚弱药水，如果要改药水配方 请联系孟<br>村民拯救器', 3),
        ('丐版全物品', './images/projects/丐版全物品.png', '主世界', '机器', '孟乃和一堆收集填充物的孩子们', '盒装物品扔进箱子中，散装物品扔入潜影盒中，物品填充完毕单机音符盒<br>孩子们，再也不用手动分类了，还有，填充分类物品真的有福了', 4),
        ('小型刷石机 7w', './images/projects/小型刷石机 7w.png', '主世界', '机器', '安星&伊凛&2K', '暂无描述喵', 5),
        ('仙人掌农场', './images/projects/仙人掌农场.png', '主世界', '机器', '安星&伊凛&2K', '暂无描述喵', 6),
        ('劫掠塔', './images/projects/劫掠塔.png', '主世界', '机器', '安星', '暂无描述喵', 7),
        ('720k祭坛刷沙机', './images/projects/720k祭坛刷沙机.png', '末地', '机器', '九日', '换色防熊，但最好别乱点，不要动机器内部任何的东西，本机器对时刻的要求卡的非常严，如果你不明白不要乱动就行，如果觉得不小心碰到了立刻群里叫九日，并且插告示牌告诉不要开机<br>并不是极限效率喵，如果真有需要还可以迭代哦', 8),
        ('全树种树场', './images/projects/全树种树场.png', '末地', '机器', '2K&伊凛&Akari', '不许种植橡树，使用杜鹃代替。最好放假人来使用，骨粉消耗很快，建议携带盒装骨块来', 9),
        ('全白名单320位熔炉组', './images/projects/全白名单320位熔炉组.png', '末地', '机器', '孟乃', '整盒输入一次性最多不能超过5盒<br>这不是老虎机，它真的是正常的，不会收税，如果收税，一定是你没有挂假人', 10),
        ('下界疣农场', './images/projects/下界疣农场.png', '末地', '机器', '2K', '暂无描述喵', 11),
        ('凋零玫瑰农场', './images/projects/凋零玫瑰农场.png', '末地', '机器', '九日&伊凛', '别去铁傀儡那边', 12),
        ('贝场', './images/projects/贝场.png', '末地', '机器', 'Akari&孟乃&2K', '<br>运贝有福了', 13),
        ('小黑塔', './images/projects/小黑塔.png', '末地', '机器', '九日&伊凛&逆风', '<br>末影珍珠才是副产物！', 14),
        ('沼泽刷怪塔', './images/projects/沼泽刷怪塔.png', '主世界', '机器', '孟乃&伊凛&2K&Akari', '<br>牢', 15),
        ('甘蔗机', './images/projects/甘蔗机.png', '主世界', '机器', '2K&Akari', '<br>跟沼泽刷怪塔在一起', 16),
        ('720k祭坛刷沙机配套固化', './images/projects/720k祭坛刷沙机配套固化.png', '主世界', '机器', '制造:九日&安星&TKT 技术指导:腐竹&孟乃', '刷普通沙子的时候一定不要开固化模式', 17),
        ('蛙明灯农场', './images/projects/蛙明灯农场.png', '主世界', '机器', '孟乃', '双维度都要假人，通过地狱交通时请注意白色玻璃的箭头指向<br>15000每小时，副产物岩浆膏5000每小时', 18),
        ('凋零骷髅农场', './images/projects/凋零骷髅农场.png', '主世界', '机器', '九日&伊凛&2K&Akari', '不要进地狱门', 19),
        ('黑曜石农场', './images/projects/黑曜石农场.png', '主世界', '机器', '九日', '别去接近凋零，别去主世界端周围跑图<br>这个凋零我困了两次才困住，所以有两只凋零被我放飞了，不知道飞哪去了，总之别往周围飞', 20),
        ('恶魂塔', './images/projects/恶魂塔.png', '主世界', '机器', '九日', '开机一次再也用不上', 21),
        ('68w猪人塔', './images/projects/68w猪人塔.png', '主世界', '机器', '孟乃&JIANFFN&everynum', '只需要挂主世界假人，地狱端请点命令方块', 22),
        ('猪灵交易所', './images/projects/猪灵交易所.png', '主世界', '机器', '孟乃&九日&安星&伊凛', '和猪人塔在一起<br>有时候 你可能发现箱子里什么都没有，这是正常的，因为效率极低', 23),
        ('72k刷冰机', './images/projects/72k刷冰机.png', '主世界', '机器', '九日&孟乃&伊凛&安星以及其他多多少少帮忙的人', '开机需要预热，关机请等飞行器归位后再离开，配套经验农场需要在3034 154 2841处挂假人砍猪人并启动飞行器<br>报警的时候记得填充盒装原木和壳子', 24),
        ('鱼塔', './images/projects/鱼塔.png', '地狱', '机器', 'JIANFFN', '上面的门去挂机点，下面的门别走', 25),
        ('粘液农场', './images/projects/粘液农场.png', '主世界', '机器', '安星&孟乃&2K&九日', '暂无描述喵', 26),
        ('苔藓骨粉机', './images/projects/苔藓骨粉机.png', '主世界', '机器', 'un_vagrant', '效率不高，一直开着就行，不抗卸载，有教皇加载<br>主要作用是美观', 27),
        ('伪和平', './images/projects/伪和平.png', '主世界', '机器', 'Akari', '主世界xz5000坐标128格范围内禁止加载，禁止进门，禁止传送传送点，仅需在地狱端开关<br>挂1400多只坚守者有福了，服务器也有福了', 28),
        ('原木去皮机', './images/projects/原木去皮机.png', '主世界', '机器', 'JIANFFN', '暂无描述喵', 29),
        ('刷花机', './images/projects/刷花机.png', '主世界', '机器', 'JIANFFN', '暂无描述喵', 30),
        ('月宫', './images/projects/月宫.png', '主世界', '建筑', 'YuriRina', '暂无描述喵', 31),
        ('温泉小屋', './images/projects/温泉小屋.png', '主世界', '建筑', 'YuriRina', '暂无描述喵', 32),
        ('樱花树屋', './images/projects/樱花树屋.png', '主世界', '建筑', 'YuriRina', '暂无描述喵', 33),
        ('小爱心', './images/projects/小爱心.png', '主世界', '建筑', 'Tling777', '暂无描述喵', 34),
        ('中世纪地主の别墅', './images/projects/中世纪地主の别墅.png', '主世界', '建筑', 'CYHsama', '暂无描述喵', 35),
        ('地狱门（伏魔版）', './images/projects/地狱门（伏魔版）.png', '主世界', '建筑', '华仔huazai', '暂无描述喵', 36),
        ('石英祭坛', './images/projects/石英祭坛.png', '主世界', '建筑', 'YuriRina', '暂无描述喵', 37),
        ('断桥聚落', './images/projects/断桥聚落.png', '主世界', '建筑', 'Dooryeah', '暂无描述喵', 38),
        ('风车麦田以及谷仓', './images/projects/风车麦田以及谷仓.png', '主世界', '建筑', 'CYHsama', '暂无描述喵', 39),
        ('徽派小院', './images/projects/徽派小院.png', '主世界', '建筑', 'Everynum', '暂无描述喵', 40),
        ('度假山庄', './images/projects/度假山庄.png', '主世界', '建筑', 'CYHsama', '暂无描述喵', 41);
    end if;

    if not exists (select 1 from public.exhibition_items) then
        insert into public.exhibition_items (image, sort_order) values
        ('./images/server_1.png', 1),
        ('./images/server_2.png', 2),
        ('./images/server_3.png', 3),
        ('./images/server_4.png', 4),
        ('./images/server_5.png', 5),
        ('./images/server_6.png', 6),
        ('./images/server_7.png', 7),
        ('./images/server_8.png', 8),
        ('./images/server_9.png', 9),
        ('./images/server_10.png', 10),
        ('./images/server_11.png', 11),
        ('./images/server_12.png', 12),
        ('./images/server_13.png', 13),
        ('./images/server_14.png', 14),
        ('./images/server_15.png', 15),
        ('./images/server_16.png', 16),
        ('./images/server_17.png', 17),
        ('./images/server_18.png', 18),
        ('./images/server_19.png', 19),
        ('./images/server_20.png', 20);
    end if;

    if not exists (select 1 from public.projection_files) then
        insert into public.projection_files (name, url, note, sort_order) values
        ('16核心刷铁机.litematic', './projections/16核心刷铁机.litematic', '对应项目：16核心刷铁机', 1);
    end if;
end
$$;

-- ============================================================
-- 成员管理（admin 页）：白名单增改/停用 + 主页公开成员列表
-- ============================================================

grant insert, update on public.member_whitelist to authenticated;

drop policy if exists "admin can read all members" on public.member_whitelist;
create policy "admin can read all members"
on public.member_whitelist for select
to authenticated
using (public.is_site_admin());

drop policy if exists "admin can insert members" on public.member_whitelist;
create policy "admin can insert members"
on public.member_whitelist for insert
to authenticated
with check (public.is_site_admin());

drop policy if exists "admin can update members" on public.member_whitelist;
create policy "admin can update members"
on public.member_whitelist for update
to authenticated
using (public.is_site_admin());

create or replace function public.get_public_members()
returns table (
    minecraft_name text,
    nickname text,
    role text,
    avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        mw.minecraft_name,
        mw.nickname,
        mw.role,
        mw.avatar_url
    from public.member_whitelist mw
    where mw.is_active
    order by lower(coalesce(nullif(mw.minecraft_name, ''), mw.nickname, mw.email)) asc;
$$;

revoke all on function public.get_public_members() from public;
grant execute on function public.get_public_members() to anon, authenticated;
