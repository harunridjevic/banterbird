import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Supabase OAuth callback handler.
 * Google (and other providers) redirect here after authentication.
 * We exchange the code for a session, auto-assign a username if the
 * user doesn't have one yet, then redirect back to the home page.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Auto-assign username for new OAuth users who don't have one yet.
      // Uses the part of their email before the @ and strips non-alphanumeric/underscore chars.
      const { data: existing } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!existing?.username && data.user.email) {
        const base = data.user.email
          .split("@")[0]!
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_") // replace invalid chars with underscore
          .replace(/^_+|_+$/g, "")     // trim leading/trailing underscores
          .slice(0, 24);               // keep it reasonable

        // Resolve collisions by appending a short numeric suffix
        const svc = createServiceRoleClient();
        let username = base;
        let attempt = 0;

        while (attempt < 10) {
          const { data: taken } = await svc
            .from("profiles")
            .select("id")
            .eq("username", username)
            .maybeSingle();

          if (!taken) break;

          attempt++;
          // e.g. "coolbird_2", "coolbird_3" ...
          username = `${base}_${attempt + 1}`;
        }

        await svc
          .from("profiles")
          .upsert({ id: data.user.id, username }, { onConflict: "id" });
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong - redirect home anyway
  return NextResponse.redirect(`${origin}/`);
}
