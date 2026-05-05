
create table public.contact_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  event_type text not null,
  before_value text,
  after_value text,
  detected_at timestamptz not null default now(),
  dismissed_at timestamptz,
  acted_on_at timestamptz
);
create index contact_events_user_unread_idx on public.contact_events (user_id, detected_at desc) where dismissed_at is null;
create index contact_events_contact_idx on public.contact_events (contact_id);

alter table public.contact_events enable row level security;

create policy "ce_events own select" on public.contact_events for select using (auth.uid() = user_id);
create policy "ce_events own insert" on public.contact_events for insert with check (auth.uid() = user_id);
create policy "ce_events own update" on public.contact_events for update using (auth.uid() = user_id);
create policy "ce_events own delete" on public.contact_events for delete using (auth.uid() = user_id);
