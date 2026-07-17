-- Log client IP on API usage rows and expose top-IP aggregation for ops moderation.

alter table public.api_usage_logs
  add column if not exists client_ip text;

create index if not exists api_usage_logs_client_ip_created_idx
  on public.api_usage_logs (client_ip, created_at desc)
  where client_ip is not null and client_ip <> '';

create or replace function public.ops_top_ips_by_usage(p_hours int default 24, p_limit int default 30)
returns table (
  client_ip text,
  api_calls bigint,
  distinct_users bigint,
  estimated_cost_usd numeric,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.client_ip,
    count(*)::bigint as api_calls,
    count(distinct l.user_id)::bigint as distinct_users,
    coalesce(sum(l.estimated_cost_usd), 0)::numeric as estimated_cost_usd,
    max(l.created_at) as last_seen_at
  from public.api_usage_logs l
  where l.client_ip is not null
    and l.client_ip <> ''
    and l.created_at >= now() - make_interval(hours => greatest(p_hours, 1))
    and l.provider in ('groq', 'gemini', 'openai', 'local')
  group by l.client_ip
  order by api_calls desc, estimated_cost_usd desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.ops_top_ips_by_usage(int, int) from public;
revoke all on function public.ops_top_ips_by_usage(int, int) from anon;
revoke all on function public.ops_top_ips_by_usage(int, int) from authenticated;
grant execute on function public.ops_top_ips_by_usage(int, int) to service_role;
