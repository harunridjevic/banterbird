import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/neverblock?zones=5991070,5991072
 *
 * Server-side proxy for the ExoClick NeverBlock API v1.
 * Fetches ad data from ExoClick's syndication endpoint and returns it to
 * the client. Because the browser only ever calls our own domain, ad
 * blockers cannot identify or block the request.
 *
 * Required headers forwarded to ExoClick for targeting:
 *   X-Forwarded-For, Referer, User-Agent, Accept-Language
 */

const NEVERBLOCK_ENDPOINT = "https://syndication-adblock.exoclick.com/ads-multi.php";

export type NeverBlockZone = {
  idzone: string;
  type: string;
  data: {
    image?: string;
    url?: string;
    imgurl?: string;
    width?: string;
    height?: string;
    [key: string]: unknown;
  };
};

export type NeverBlockResponse = {
  zones: NeverBlockZone[];
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const zonesParam = searchParams.get("zones") ?? "";
  const zoneIds = zonesParam.split(",").map((z) => z.trim()).filter(Boolean);

  if (zoneIds.length === 0) {
    return NextResponse.json({ error: "zones required" }, { status: 400 });
  }

  // Forward client IP for targeting
  const userIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    "1.1.1.1";

  // Build query string manually — URLSearchParams encodes brackets which ExoClick rejects.
  // Required format: v=1&zones[0][idzone]=XXX&zones[1][idzone]=YYY&user_ip=Z
  const parts = [`v=1`, `user_ip=${encodeURIComponent(userIp)}`];
  zoneIds.forEach((id, i) => {
    parts.push(`zones[${i}][idzone]=${encodeURIComponent(id)}`);
  });

  const upstreamUrl = `${NEVERBLOCK_ENDPOINT}?${parts.join("&")}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "X-Forwarded-For": userIp,
        "Referer": req.headers.get("referer") ?? "https://banterbird.app",
        "User-Agent": req.headers.get("user-agent") ?? "Mozilla/5.0",
        "Accept-Language": req.headers.get("accept-language") ?? "en-US,en;q=0.9",
      },
      // 3 second timeout — if ExoClick is slow we fail gracefully
      signal: AbortSignal.timeout(3000),
    });

    if (!upstream.ok) {
      return NextResponse.json({ zones: [] }, { status: 200 });
    }

    const data = (await upstream.json()) as NeverBlockResponse;

    // Cache briefly — ads are targeted so don't cache too long
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Fail silently — no ad is better than a broken page
    return NextResponse.json({ zones: [] }, { status: 200 });
  }
}
