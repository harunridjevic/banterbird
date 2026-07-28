import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { sendEmail, buildPasswordChangedEmail } from "@/lib/email/send";

/**
 * POST /api/auth/notify-password-changed
 * Sends a "your password was changed" notification email.
 * Called from the ProfileEditor after a successful password update.
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { email?: string };
    const email = body.email ?? user.email;
    if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

    const payload = buildPasswordChangedEmail(email);
    const result = await sendEmail(payload);
    return NextResponse.json({ ok: result.ok });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
