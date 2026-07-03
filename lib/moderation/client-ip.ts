import type { NextRequest } from "next/server";

export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  const real = req.headers.get("x-real-ip");
  return real?.trim() ?? null;
}
