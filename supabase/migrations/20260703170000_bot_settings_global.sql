-- Global bot settings (ops-tunable, affects all users and devices)
insert into public.app_settings (key, value) values
  ('bot_settings', '{}'::jsonb)
on conflict (key) do nothing;
