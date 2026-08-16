-- ============================================================
-- Life Hub — chạy MỘT LẦN trong Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.lifehub_items (
  workspace   text        not null,
  kind        text        not null,
  item_id     text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false,
  primary key (workspace, kind, item_id)
);

create index if not exists lifehub_items_ws_upd
  on public.lifehub_items (workspace, updated_at desc);

-- Bật RLS rồi mở quyền cho khoá anon, giới hạn đúng trong bảng này.
-- Mô hình bảo mật ở đây là "ai biết tên không gian thì đọc ghi được không gian đó",
-- giống một link chia sẻ bí mật. Vì vậy hãy đặt tên không gian dài và khó đoán
-- (nút "Tạo tên ngẫu nhiên" trong app làm sẵn việc này) và chỉ đưa cho người bạn tin.
alter table public.lifehub_items enable row level security;

drop policy if exists lifehub_all on public.lifehub_items;
create policy lifehub_all on public.lifehub_items
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Tuỳ chọn: chặn tên không gian quá ngắn để tránh bị dò trúng.
alter table public.lifehub_items drop constraint if exists lifehub_ws_len;
alter table public.lifehub_items add constraint lifehub_ws_len
  check (char_length(workspace) >= 8);
