# BanterBird

Anonymous, random-pair chat built with **Next.js** (App Router), **TypeScript**, **Tailwind CSS**, **Supabase** (Auth + Postgres + Realtime), and **Framer Motion**.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

## Local setup

1. **Environment variables**

   Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` plus **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** (Supabase publishable key from Settings → API). The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is still supported if the publishable key is not set.

2. **Database**

   In the Supabase SQL editor, run the migration in `supabase/migrations/20250512000000_init.sql`.

   If `alter publication supabase_realtime add table` errors because a table is already in the publication, remove those lines for tables that are already listed.

3. **Authentication**

   In Supabase: **Authentication > Providers > Anonymous** - enable anonymous sign-ins. This gives each visitor a stable user id for row-level security without passwords.

4. **Realtime**

   Ensure **Realtime** is enabled for your project. The migration adds `messages` and `rooms` to the `supabase_realtime` publication so inserts sync to clients.

5. **Install and run**

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Branding

The BanterBird logo is served from `public/banterbird-logo.png`. Replace that file if you update the asset.

## Deploy on Vercel

1. Push the repo to GitHub and import the project in Vercel.
2. Add the same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or anon key) in the Vercel project settings.
3. Deploy. No extra build configuration is required beyond the defaults for Next.js.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/(main)/` | Landing (`/`), match (`/match`), chat (`/chat/[roomId]`) |
| `components/` | UI: navbar, chat, match lobby, presence, branding |
| `utils/supabase/` | Browser client, server client (`createClient(cookieStore)`), session middleware |
| `supabase/migrations/` | SQL schema, RLS, RPCs (`try_match`, `leave_match_queue`, `end_active_room`) |

## Scripts

- `npm run dev` - development server
- `npm run build` - production build
- `npm run start` - start production server
- `npm run lint` - ESLint
