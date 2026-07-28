/**
 * Transactional email via Resend.
 * Set RESEND_API_KEY in your environment.
 * From: no-reply@banterbird.app
 */

const FROM = "BanterBird <no-reply@banterbird.app>";
const RESEND_API = "https://api.resend.com/emails";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set - skipping email send");
    return { ok: false, error: "Email service not configured." };
  }

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [payload.to], subject: payload.subject, html: payload.html, text: payload.text }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const msg = body.message ?? `Resend error ${res.status}`;
    console.error("[email] Send failed:", msg);
    return { ok: false, error: msg };
  }
  return { ok: true };
}

// ── Shared design tokens ───────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://banterbird.app";
const YEAR = new Date().getFullYear();

// Bird SVG mark (inline so no external image request)
const BIRD_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
  <rect width="32" height="32" rx="10" fill="white" fill-opacity="0.15"/>
  <path d="M8 10C8 10 10 8 14 9C14 9 13 11 11 12C11 12 14 13 17 11C17 11 18 14 15 16C15 16 18 16 20 14C20 14 22 18 18 21C18 21 20 22 22 21C22 21 20 25 15 24C15 24 10 24 8 20C8 20 6 17 8 13C8 13 7 12 8 10Z" fill="white"/>
  <path d="M14 9C14 9 16 7 19 8C19 8 18 10 16 11" stroke="white" stroke-width="0.5" stroke-linecap="round" fill="none"/>
</svg>`;

// ── Layout wrapper ─────────────────────────────────────────────────────────

function emailWrapper(previewText: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>BanterBird</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #f0f2f5; -webkit-font-smoothing: antialiased; }
    a { color: inherit; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;">
  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px;">
    <tr><td align="center">

      <!-- Card -->
      <table role="presentation" width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#141f2e 0%,#1e2a3d 100%);border-radius:20px 20px 0 0;padding:28px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:40px;vertical-align:middle;">${BIRD_SVG}</td>
                <td style="padding-left:12px;vertical-align:middle;">
                  <span style="font-family:'Inter',Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">BanterBird</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-radius:0 0 20px 20px;border:1px solid #e2e8f0;border-top:none;padding:20px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#94a3b8;line-height:1.5;">
                  You received this email because an action was taken on your BanterBird account.
                  If you did not request this, you can safely ignore it.
                </td>
              </tr>
              <tr><td style="padding-top:12px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:'Inter',Arial,sans-serif;font-size:11px;color:#cbd5e1;">
                      &copy; ${YEAR} BanterBird
                      &nbsp;&nbsp;
                      <a href="${BASE_URL}/legal/privacy" style="color:#94a3b8;text-decoration:underline;">Privacy</a>
                      &nbsp;&nbsp;
                      <a href="${BASE_URL}/contact" style="color:#94a3b8;text-decoration:underline;">Support</a>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Reusable button ────────────────────────────────────────────────────────

function ctaButton(href: string, label: string, color = "#141f2e"): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr>
        <td style="background:${color};border-radius:12px;">
          <a href="${href}"
             style="display:inline-block;font-family:'Inter',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;letter-spacing:-0.1px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

function fallbackLink(href: string): string {
  return `
    <p style="margin:16px 0 0;font-family:'Inter',Arial,sans-serif;font-size:13px;color:#94a3b8;line-height:1.6;">
      Button not working? Copy and paste this link into your browser:<br>
      <a href="${href}" style="color:#475569;word-break:break-all;font-size:12px;">${href}</a>
    </p>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 10px;font-family:'Inter',Arial,sans-serif;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;line-height:1.2;">${text}</h1>`;
}

function body(text: string): string {
  return `<p style="margin:0 0 0;font-family:'Inter',Arial,sans-serif;font-size:15px;color:#475569;line-height:1.65;">${text}</p>`;
}

function divider(): string {
  return `<div style="height:1px;background:#f1f5f9;margin:24px 0;"></div>`;
}

// ── Templates ──────────────────────────────────────────────────────────────

export function buildVerificationEmail(confirmUrl: string, to: string): EmailPayload {
  const content = `
    ${heading("Verify your email address")}
    <p style="margin:10px 0 0;font-family:'Inter',Arial,sans-serif;font-size:15px;color:#64748b;line-height:1.65;">
      Welcome to BanterBird. Click the button below to confirm your email address and activate your account.
    </p>
    ${ctaButton(confirmUrl, "Verify email address")}
    <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:13px;color:#94a3b8;">
      This link expires in <strong style="color:#64748b;">24 hours</strong>.
    </p>
    ${fallbackLink(confirmUrl)}`;

  return {
    to,
    subject: "Verify your BanterBird email address",
    html: emailWrapper("Confirm your email to activate your BanterBird account.", content),
    text: `Welcome to BanterBird!\n\nVerify your email address by clicking the link below:\n${confirmUrl}\n\nThis link expires in 24 hours.`,
  };
}

export function buildPasswordResetEmail(resetUrl: string, to: string): EmailPayload {
  const content = `
    ${heading("Reset your password")}
    <p style="margin:10px 0 0;font-family:'Inter',Arial,sans-serif;font-size:15px;color:#64748b;line-height:1.65;">
      We received a request to reset the password for your BanterBird account.
      Click the button below to choose a new one.
    </p>
    ${ctaButton(resetUrl, "Reset password")}
    <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:13px;color:#94a3b8;">
      This link expires in <strong style="color:#64748b;">1 hour</strong>.
      If you did not request a reset, no action is needed.
    </p>
    ${fallbackLink(resetUrl)}`;

  return {
    to,
    subject: "Reset your BanterBird password",
    html: emailWrapper("Reset your BanterBird password - link expires in 1 hour.", content),
    text: `Reset your BanterBird password\n\nClick the link below to choose a new password:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
  };
}

export function buildEmailChangeEmail(confirmUrl: string, newEmail: string): EmailPayload {
  const content = `
    ${heading("Confirm your new email")}
    <p style="margin:10px 0 0;font-family:'Inter',Arial,sans-serif;font-size:15px;color:#64748b;line-height:1.65;">
      You requested to change your BanterBird email address to
      <strong style="color:#334155;">${newEmail}</strong>.
      Click below to confirm this change.
    </p>
    ${ctaButton(confirmUrl, "Confirm new email")}
    <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:13px;color:#94a3b8;">
      This link expires in <strong style="color:#64748b;">24 hours</strong>.
      Your old email remains active until you confirm.
    </p>
    ${fallbackLink(confirmUrl)}`;

  return {
    to: newEmail,
    subject: "Confirm your new BanterBird email address",
    html: emailWrapper(`Confirm ${newEmail} as your new BanterBird email.`, content),
    text: `Confirm your new BanterBird email\n\nClick the link to confirm ${newEmail}:\n${confirmUrl}\n\nThis link expires in 24 hours.`,
  };
}

export function buildPasswordChangedEmail(to: string): EmailPayload {
  const content = `
    ${heading("Your password was changed")}
    <p style="margin:10px 0 0;font-family:'Inter',Arial,sans-serif;font-size:15px;color:#64748b;line-height:1.65;">
      Your BanterBird password was successfully updated.
    </p>
    ${divider()}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#fef9ec;border:1px solid #fde68a;border-radius:10px;padding:16px;">
      <tr><td>
        <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:13px;color:#92400e;line-height:1.6;">
          <strong>Not you?</strong> If you did not make this change, please contact us immediately at
          <a href="mailto:support@banterbird.app" style="color:#92400e;font-weight:600;">support@banterbird.app</a>
          so we can secure your account.
        </p>
      </td></tr>
    </table>`;

  return {
    to,
    subject: "Your BanterBird password was changed",
    html: emailWrapper("Your BanterBird password was recently changed.", content),
    text: `Your BanterBird password was changed.\n\nIf you did not do this, contact support@banterbird.app immediately.`,
  };
}
