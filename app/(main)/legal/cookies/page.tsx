import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "How BanterBird (banterbird.app) uses cookies and local storage for auth, preferences, and essential features. No third-party ad trackers.",
  alternates: { canonical: "/legal/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPageShell title="Cookie Policy" updated="July 3, 2026">
      <p>BanterBird uses cookies and similar technologies to operate the service.</p>
      <h2>Essential cookies</h2>
      <ul>
        <li>
          <strong>Authentication</strong>: Supabase session cookies keep you signed in anonymously.
        </li>
        <li>
          <strong>Ops access</strong>: Internal dashboard session cookies (staff only).
        </li>
      </ul>
      <h2>Local storage</h2>
      <p>We also use browser local storage for:</p>
      <ul>
        <li>Match preferences (gender filters)</li>
        <li>Device identifier for abuse prevention</li>
        <li>Age confirmation for the current browser session</li>
        <li>Session blocks (users you chose not to rematch during this visit)</li>
      </ul>
      <h2>Analytics</h2>
      <p>
        We log aggregated usage and error data server-side to monitor reliability. We do not use
        third-party advertising trackers.
      </p>
      <h2>Managing cookies</h2>
      <p>
        You can clear cookies and site data in your browser settings. Essential cookies are required
        to use the chat service.
      </p>
    </LegalPageShell>
  );
}
