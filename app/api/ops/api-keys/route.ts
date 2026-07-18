import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieSecret, verifyAnalyticsCookie, COOKIE_NAME } from "@/lib/ops/analytics-cookie";
import {
  createOpsApiKey,
  deleteOpsApiKey,
  invalidateApiKeyCache,
  listOpsApiKeys,
  reorderOpsApiKeys,
  updateOpsApiKey,
  type ApiKeyProvider,
} from "@/lib/ops/api-keys";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function requireOpsAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return verifyAnalyticsCookie(cookieSecret(), token);
}

export async function GET() {
  if (!(await requireOpsAuth())) return unauthorized();
  const keys = await listOpsApiKeys();
  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  if (!(await requireOpsAuth())) return unauthorized();
  try {
    const body = (await req.json()) as {
      action?: string;
      name?: string;
      provider?: ApiKeyProvider;
      apiKey?: string;
      priority?: number;
      id?: string;
      enabled?: boolean;
      clearRateLimit?: boolean;
      orderedIds?: string[];
    };

    if (body.action === "reorder" && Array.isArray(body.orderedIds)) {
      const keys = await reorderOpsApiKeys(body.orderedIds.filter((id) => typeof id === "string"));
      invalidateApiKeyCache();
      return NextResponse.json({ keys });
    }

    if (body.action === "update" && body.id) {
      const key = await updateOpsApiKey(body.id, {
        name: body.name,
        priority: body.priority,
        enabled: body.enabled,
        apiKey: body.apiKey,
        clearRateLimit: body.clearRateLimit,
      });
      invalidateApiKeyCache();
      return NextResponse.json({ key });
    }

    if (body.action === "delete" && body.id) {
      await deleteOpsApiKey(body.id);
      invalidateApiKeyCache();
      return NextResponse.json({ ok: true });
    }

    // default: create
    if (!body.provider || !body.apiKey) {
      return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
    }
    const key = await createOpsApiKey({
      name: body.name ?? "",
      provider: body.provider,
      apiKey: body.apiKey,
      priority: body.priority,
    });
    invalidateApiKeyCache();
    return NextResponse.json({ key }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
