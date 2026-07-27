import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  // Supabase sets type=signup for email confirmation, type=recovery for password reset
  const type = searchParams.get("type");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Auto-assign username ONLY for Google OAuth sign-ins, never for email
      // confirmation (type=signup) or password reset (type=recovery) flows.
      // Email/password users already chose their username during sign-up.
      const isGoogleOAuth =
        !type &&
        (data.user.app_metadata?.provider === "google" ||
          (data.user.identities ?? []).some((i: { provider: string }) => i.provider === "google"));

      if (isGoogleOAuth) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", data.user.id)
          .maybeSingle();

        // Only assign if they don't have a username yet (first Google login)
        if (!existing?.username && data.user.email) {
          const base = data.user.email
            .split("@")[0]!
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 24);

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
            username = `${base}_${attempt + 1}`;
          }

          await svc
            .from("profiles")
            .upsert({ id: data.user.id, username }, { onConflict: "id" });
        }
      }

      // Password reset: send to the reset page
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/account/reset-password`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
