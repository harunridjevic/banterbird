/**
 * VPN / proxy / hosting detection.
 *
 * Strategy (fastest first, no-API-key fallback):
 *  1. If IPQUALITYSCORE_API_KEY is set → call IPQualityScore (very accurate).
 *  2. Else if IPAPI_KEY is set          → call ipapi.com (good accuracy).
 *  3. Else                              → call ip-api.com free tier (no key needed,
 *                                         covers most datacenter/VPN IPs).
 *
 * Returns { isVpn: true } when any provider flags the IP as VPN / proxy /
 * Tor / hosting / datacenter.  On any network error we fail open (isVpn: false)
 * so a provider outage never hard-blocks all users.
 */

export type VpnCheckResult =
  | { isVpn: false }
  | { isVpn: true; reason: string };

/** Private / loopback / reserved ranges that should never be flagged. */
function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  // RFC 1918 / link-local / CGN
  const v4Priv =
    /^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^169\.254\.|^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
  if (v4Priv.test(ip)) return true;
  if (ip.startsWith("::ffff:")) {
    const inner = ip.slice(7);
    if (v4Priv.test(inner)) return true;
  }
  return false;
}

async function checkIpQualityScore(ip: string, apiKey: string): Promise<VpnCheckResult> {
  const url = `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true&lighter_penalties=false&mobile=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return { isVpn: false };
  const data = (await res.json()) as {
    success?: boolean;
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    is_crawler?: boolean;
    host?: string;
    fraud_score?: number;
  };
  if (!data.success) return { isVpn: false };
  if (data.vpn || data.proxy || data.tor) {
    const why = [data.vpn && "vpn", data.proxy && "proxy", data.tor && "tor"]
      .filter(Boolean)
      .join(",");
    return { isVpn: true, reason: `ipqualityscore:${why}` };
  }
  if ((data.fraud_score ?? 0) >= 85) {
    return { isVpn: true, reason: `ipqualityscore:fraud_score=${data.fraud_score}` };
  }
  return { isVpn: false };
}

async function checkIpapiCom(ip: string, apiKey: string): Promise<VpnCheckResult> {
  const url = `https://ipapi.com/ip_api.php?ip=${encodeURIComponent(ip)}&key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return { isVpn: false };
  const data = (await res.json()) as {
    security?: { is_vpn?: boolean; is_proxy?: boolean; is_tor?: boolean; is_hosting?: boolean };
  };
  const sec = data.security;
  if (sec?.is_vpn || sec?.is_proxy || sec?.is_tor) {
    const why = [
      sec.is_vpn && "vpn",
      sec.is_proxy && "proxy",
      sec.is_tor && "tor",
    ]
      .filter(Boolean)
      .join(",");
    return { isVpn: true, reason: `ipapi:${why}` };
  }
  return { isVpn: false };
}

async function checkIpApiFree(ip: string): Promise<VpnCheckResult> {
  // ip-api.com free tier: 45 req/min, no key, covers proxy/hosting/VPN detection
  const fields = "status,proxy,hosting,query";
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return { isVpn: false };
  const data = (await res.json()) as {
    status?: string;
    proxy?: boolean;
    hosting?: boolean;
  };
  if (data.status !== "success") return { isVpn: false };
  if (data.proxy || data.hosting) {
    const why = [data.proxy && "proxy", data.hosting && "hosting"].filter(Boolean).join(",");
    return { isVpn: true, reason: `ip-api:${why}` };
  }
  return { isVpn: false };
}

export async function detectVpn(ip: string | null | undefined): Promise<VpnCheckResult> {
  if (!ip) return { isVpn: false };
  // Never flag internal / private IPs (dev environments, reverse proxies)
  if (isPrivateIp(ip)) return { isVpn: false };

  try {
    const iqsKey = process.env.IPQUALITYSCORE_API_KEY;
    if (iqsKey) {
      return await checkIpQualityScore(ip, iqsKey);
    }

    const iapiKey = process.env.IPAPI_KEY;
    if (iapiKey) {
      return await checkIpapiCom(ip, iapiKey);
    }

    // Free fallback — works without any API key
    return await checkIpApiFree(ip);
  } catch {
    // Fail open — never hard-block on provider errors
    return { isVpn: false };
  }
}
