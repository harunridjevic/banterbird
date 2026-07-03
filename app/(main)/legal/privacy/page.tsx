import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updated="July 3, 2026">
      <p>
        BanterBird respects your privacy. This policy explains what we collect and how we use it.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Anonymous session identifiers (via Supabase Auth)</li>
        <li>Chat messages during active sessions</li>
        <li>Device identifiers for abuse prevention and moderation</li>
        <li>Technical logs (errors, API usage) for reliability and security</li>
      </ul>
      <h2>How we use data</h2>
      <ul>
        <li>To provide real-time matching and messaging</li>
        <li>To enforce rate limits and block abusive users</li>
        <li>To investigate reports submitted by users</li>
        <li>To improve service reliability</li>
      </ul>
      <h2>Retention</h2>
      <p>
        Active chat rooms are deleted when ended. Reports and moderation records may be retained for
        safety investigations. Error logs are retained for a limited operational period.
      </p>
      <h2>Third parties</h2>
      <p>
        We use Supabase for authentication and database hosting, and AI providers (e.g. Groq) for
        practice bot conversations. See our{" "}
        <Link href="/legal/cookies" className="text-violet-600 underline-offset-2 hover:underline">
          Cookie Policy
        </Link>
        .
      </p>
      <h2>Your rights</h2>
      <p>
        You may contact us to request information about data we hold related to your use of the
        service, subject to applicable law.
      </p>
    </LegalPageShell>
  );
}
