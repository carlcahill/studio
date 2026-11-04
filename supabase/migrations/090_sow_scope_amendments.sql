-- Notes recorded when an approved statement of work is updated after the client
-- has already agreed a scope change. Approval itself is left in place.

create table if not exists public.sow_scope_amendments (
  id uuid default uuid_generate_v4() primary key,
  sow_id uuid not null references public.sow_documents(id) on delete cascade,
  note text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now() not null,
  constraint sow_scope_amendments_note_length check (
    char_length(note) >= 10 and char_length(note) <= 500
  )
);

create index if not exists idx_sow_scope_amendments_sow_id
  on public.sow_scope_amendments(sow_id, created_at desc);

alter table public.sow_scope_amendments enable row level security;

drop policy if exists "Team can manage sow scope amendments" on public.sow_scope_amendments;

create policy "Team can manage sow scope amendments"
  on public.sow_scope_amendments for all
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin', 'designer', 'manager')
        and deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin', 'designer', 'manager')
        and deleted_at is null
    )
  );

comment on table public.sow_scope_amendments is
  'Scope changes made after client approval, when the client is already aware. The original approval is unchanged.';
