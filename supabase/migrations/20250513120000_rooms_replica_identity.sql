-- Ensure realtime UPDATE payloads for rooms include full row (both peers see skip/end).
alter table public.rooms replica identity full;
