const ALERT_TO = ["support@banterbird.app", "business@banterbird.app"] as const;

export async function sendOpsAlertEmail(subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.OPS_ALERT_FROM?.trim() || "BanterBird Alerts <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn("sendOpsAlertEmail skipped (RESEND_API_KEY unset):", subject);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [...ALERT_TO],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Resend email failed", res.status, body.slice(0, 500));
      return false;
    }
    return true;
  } catch (e) {
    console.error("sendOpsAlertEmail", e);
    return false;
  }
}
