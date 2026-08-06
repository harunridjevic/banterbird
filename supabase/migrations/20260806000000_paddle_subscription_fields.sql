-- Add Paddle-specific columns to pro_subscriptions
-- provider column already exists (defaults to 'nowpayments'); new rows use 'paddle'

alter table public.pro_subscriptions
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_customer_id     text,
  add column if not exists paddle_transaction_id  text;

comment on column public.pro_subscriptions.paddle_subscription_id is 'Paddle subscription ID (sub_*). Set on subscription.activated webhook.';
comment on column public.pro_subscriptions.paddle_customer_id     is 'Paddle customer ID (ctm_*). Set on subscription.activated webhook.';
comment on column public.pro_subscriptions.paddle_transaction_id  is 'Paddle transaction ID for the latest completed payment (txn_*).';

create index if not exists pro_subscriptions_paddle_subscription_id_idx
  on public.pro_subscriptions (paddle_subscription_id)
  where paddle_subscription_id is not null;

create index if not exists pro_subscriptions_paddle_customer_id_idx
  on public.pro_subscriptions (paddle_customer_id)
  where paddle_customer_id is not null;
