# Supabase Email Setup for BanterBird

All transactional emails (verification, password reset, change notifications)
are sent from `no-reply@banterbird.app` via Resend.

---

## 1. Add your domain to Resend

1. Go to [resend.com](https://resend.com) and sign up / log in
2. Domains → Add domain → enter `banterbird.app`
3. Add the DNS records Resend gives you (SPF, DKIM, DMARC) to your domain registrar
4. Click Verify — takes a few minutes
5. Copy your API key from API Keys → Create API Key → paste into `.env.local` as `RESEND_API_KEY`

---

## 2. Configure Supabase to use Resend as custom SMTP

In your Supabase project → **Project Settings → Auth → SMTP Settings**:

| Field | Value |
|-------|-------|
| Enable custom SMTP | ON |
| Sender name | BanterBird |
| Sender email | no-reply@banterbird.app |
| Host | smtp.resend.com |
| Port | 465 |
| Username | resend |
| Password | `your RESEND_API_KEY` |

This makes Supabase send all auth emails (confirmation, reset, magic link)
through Resend using your verified domain.

---

## 3. Turn email confirmation back ON

Supabase Dashboard → **Authentication → Providers → Email**:

- **Confirm email**: ON
- **Secure email change**: ON (sends confirmation to both old and new address)
- **Secure password change**: ON (optional — sends OTP before allowing change)

The `SignUpForm` already handles the "awaiting verification" state — it shows
a "Check your inbox" screen when `data.session` is null after `signUp()`.

---

## 4. Set redirect URLs

Authentication → **URL Configuration**:

- **Site URL**: `https://banterbird.app`
- **Redirect URLs** (add all of these):
  ```
  https://banterbird.app/auth/callback
  https://banterbird.app/account/reset-password
  http://localhost:3000/auth/callback
  http://localhost:3000/account/reset-password
  ```

---

## 5. Email templates (optional but recommended)

Authentication → **Email Templates** — you can leave these as Supabase defaults
since Supabase is now routing through Resend with your domain. The templates just
need the correct redirect links which are set via `emailRedirectTo` in the code.

---

## 6. Google OAuth (if not done yet)

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID → Web application
3. Authorized redirect URIs → add:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
4. Copy Client ID and Client Secret
5. Supabase → Authentication → Providers → Google → paste both → Save

---

## Flow summary

| Action | What happens |
|--------|-------------|
| Sign up (email) | Supabase sends confirmation via Resend SMTP → user clicks link → `/auth/callback` → redirected home |
| Forgot password | `supabase.auth.resetPasswordForEmail()` → Resend SMTP → link goes to `/account/reset-password` |
| Change email | `supabase.auth.updateUser({ email })` → Resend SMTP sends confirmation to new address |
| Change password | `supabase.auth.updateUser({ password })` → `/api/auth/notify-password-changed` sends notification via Resend API |
| Google sign in | OAuth flow → `/auth/callback` → username auto-assigned from email prefix |
