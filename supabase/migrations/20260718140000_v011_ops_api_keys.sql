-- v0.11.0: ops-managed LLM API key pool (Cerebras / Groq) with priority + rate-limit status

create table if not exists public.ops_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null check (provider in ('cerebras', 'groq')),
  key_ciphertext text not null,
  key_prefix text not null,
  priority integer not null default 100,
  enabled boolean not null default true,
  rate_limited_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ops_api_keys_provider_priority_idx
  on public.ops_api_keys (provider, priority asc, created_at asc)
  where enabled = true;

alter table public.ops_api_keys enable row level security;

-- No policies for authenticated/anon — service role only (ops API).
