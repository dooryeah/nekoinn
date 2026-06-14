create extension if not exists pgcrypto;

create table if not exists public.member_whitelist (
    email text primary key,
    email_normalized text generated always as (lower(email)) stored unique,
    nickname text,
    minecraft_name text,
    role text not null default 'member',
    avatar_url text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.member_resources (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    body text,
    url text,
    category text,
    sort_order integer not null default 100,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists member_whitelist_active_email_idx
    on public.member_whitelist (email_normalized)
    where is_active;

create index if not exists member_resources_active_sort_idx
    on public.member_resources (is_active, sort_order, created_at desc);

alter table public.member_whitelist enable row level security;
alter table public.member_resources enable row level security;

drop policy if exists "members can read own whitelist row" on public.member_whitelist;
create policy "members can read own whitelist row"
on public.member_whitelist
for select
to authenticated
using (
    is_active
    and email_normalized = lower(auth.jwt() ->> 'email')
);

drop policy if exists "whitelisted members can read resources" on public.member_resources;
create policy "whitelisted members can read resources"
on public.member_resources
for select
to authenticated
using (
    is_active
    and exists (
        select 1
        from public.member_whitelist mw
        where mw.is_active
        and mw.email_normalized = lower(auth.jwt() ->> 'email')
    )
);

grant usage on schema public to authenticated;
grant select on public.member_whitelist to authenticated;
grant select on public.member_resources to authenticated;

insert into public.member_resources (title, body, category, sort_order)
select '成员公告', '这里可以放只给白名单成员读取的公告。', '公告', 10
where not exists (
    select 1 from public.member_resources where title = '成员公告'
);

insert into public.member_resources (title, body, category, sort_order)
select '内部资料入口', '把真正需要保护的内容放在 Supabase 表里，前端登录后再读取。', '资料', 20
where not exists (
    select 1 from public.member_resources where title = '内部资料入口'
);
