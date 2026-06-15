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
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

alter table public.member_whitelist
    add column if not exists signature text,
    add column if not exists background_path text;

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

create index if not exists member_whitelist_active_email_idx
    on public.member_whitelist (email_normalized)
    where is_active;

create index if not exists member_checkins_rank_idx
    on public.member_checkins (email_normalized, checkin_date desc);

alter table public.member_whitelist enable row level security;
alter table public.member_checkins enable row level security;

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

create or replace function public.get_my_checkin_status()
returns table (
    checked_in_today boolean,
    total_count bigint,
    checked_at timestamptz
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
        max(mc.created_at) as checked_at
    from public.member_checkins mc
    where mc.email_normalized = current_email;
end;
$$;

create or replace function public.check_in_member()
returns table (
    checked_in_today boolean,
    total_count bigint,
    checked_at timestamptz
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

    insert into public.member_checkins (email_normalized, checkin_date)
    values (current_email, today)
    on conflict (email_normalized, checkin_date) do nothing;

    return query
    select
        exists (
            select 1
            from public.member_checkins mc
            where mc.email_normalized = current_email
            and mc.checkin_date = today
        ) as checked_in_today,
        count(mc.id)::bigint as total_count,
        max(mc.created_at) as checked_at
    from public.member_checkins mc
    where mc.email_normalized = current_email;
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
    checkin_date date
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
    on conflict (email_normalized, checkin_date) do nothing;

    get diagnostics inserted_count = row_count;

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
        today as checkin_date
    from public.member_whitelist mw
    left join public.member_checkins mc
        on mc.email_normalized = mw.email_normalized
    where mw.is_active
    and mw.email_normalized = current_email
    group by mw.email, mw.nickname, mw.minecraft_name;
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

create or replace function public.get_checkin_leaderboard(limit_count integer default 30)
returns table (
    rank_position bigint,
    display_name text,
    email text,
    minecraft_name text,
    avatar_url text,
    total_count bigint,
    last_checkin_date date,
    checked_in_today boolean
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
            count(mc.id)::bigint as total_count,
            max(mc.checkin_date) as last_checkin_date,
            bool_or(mc.checkin_date = today) as checked_in_today
        from public.member_checkins mc
        join public.member_whitelist mw
            on mw.email_normalized = mc.email_normalized
        where mw.is_active
        group by mw.email, mw.nickname, mw.minecraft_name, mw.avatar_url
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
        coalesce(totals.checked_in_today, false) as checked_in_today
    from totals
    order by totals.total_count desc, totals.last_checkin_date desc nulls last, totals.display_name asc
    limit result_limit;
end;
$$;

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
    checked_in_today boolean
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
        coalesce(bool_or(mc.checkin_date = today), false) as checked_in_today
    from public.member_whitelist mw
    left join public.member_checkins mc
        on mc.email_normalized = mw.email_normalized
    where mw.is_active
    and (
        lower(coalesce(mw.minecraft_name, '')) = target_player
        or lower(coalesce(mw.nickname, '')) = target_player
    )
    group by mw.email_normalized, mw.nickname, mw.minecraft_name, mw.role, mw.avatar_url, mw.signature, mw.background_path
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
    checked_in_today boolean
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
        coalesce(bool_or(mc.checkin_date = today), false) as checked_in_today
    from public.member_whitelist mw
    left join public.member_checkins mc
        on mc.email_normalized = mw.email_normalized
    where mw.is_active
    and (
        lower(coalesce(mw.minecraft_name, '')) = target_player
        or lower(coalesce(mw.nickname, '')) = target_player
    )
    group by mw.email_normalized, mw.nickname, mw.minecraft_name, mw.role, mw.avatar_url, mw.signature, mw.background_path
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

grant execute on function public.get_my_checkin_status() to authenticated;
grant execute on function public.check_in_member() to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.get_checkin_leaderboard(integer) to authenticated;
grant execute on function public.get_member_public_profile(text) to authenticated;
grant execute on function public.get_bot_member_card(text) to service_role;
grant execute on function public.bot_check_in_member(text) to service_role;
