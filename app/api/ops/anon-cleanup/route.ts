import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, cookieSecret, verifyAnalyticsCookie } from "@/lib/ops/analytics-cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AnonCleanupResult = {
  deleted: number;
  dryRun: boolean;
};

/**
 * DELETE /api/ops/anon-cleanup
 * Deletes anonymous auth users that are older than 1 hour and have no
 * associated profile row (i.e. never converted to a registered account).
 *
 * Pass ?dry=true to preview the count without deleting.
 */
export async function DELETE(req: Request) {
  const secret = cookieSecret();
  if (!secret) return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifyAnalyticsCookie(secret, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dry") === "true";

  const svc = createServiceRoleClient();

  // Collect all anon users older than 1 hour, paginating through the full list
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let staleIds: string[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const staleOnPage = data.users
      .filter((u) => {
        const provider = (u.app_metadata?.provider as string | undefined) ?? "";
        const hasEmail = typeof u.email === "string" && u.email.trim().length > 0;
        return (
          (provider === "anonymous" || u.is_anonymous === true) &&
          !hasEmail &&
          u.created_at < cutoff
        );
      })
      .map((u) => u.id);

    staleIds = [...staleIds, ...staleOnPage];
    if (data.users.length < perPage) break;
    page++;
    if (page > 20) break; // safety cap
  }

  if (dryRun || staleIds.length === 0) {
    return NextResponse.json({ deleted: staleIds.length, dryRun: true } satisfies AnonCleanupResult);
  }

  // Delete in batches of 100 to avoid hitting API limits
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < staleIds.length; i += BATCH) {
    const batch = staleIds.slice(i, i + BATCH);
    await Promise.all(
      batch.map((id) => svc.auth.admin.deleteUser(id))
    );
    deleted += batch.length;
  }

  return NextResponse.json({ deleted, dryRun: false } satisfies AnonCleanupResult);
}
