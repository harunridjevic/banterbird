import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const type = searchParams.get("type"); // "signup" | "recovery" | null

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/`);
  }

  const user = data.user;

  // Password reset — go to the reset page
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/account/reset-password`);
  }

  // Google OAuth (linkIdentity or signInWithOAuth)
  const isGoogle =
    !type &&
    (user.app_metadata?.provider === "google" ||
      (user.identities ?? []).some((i: { provider: string }) => i.provider === "google"));

  if (isGoogle) {
    // Auto-assign username only if the user doesn't have one yet.
    // linkIdentity preserves the existing anonymous user ID and profile,
    // so existing users keep their username. New Google sign-ins get one derived
    // from their email.
    const { data: existing } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing?.username && user.email) {
      const base = user.email
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
        .upsert({ id: user.id, username }, { onConflict: "id" });
    }

    // Redirect to relay page which reads sessionStorage for the return path
    return NextResponse.redirect(`${origin}/auth/return`);
  }

  // Email confirmation or other flows
  return NextResponse.redirect(`${origin}${next}`);
}
