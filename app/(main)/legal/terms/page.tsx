import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read BanterBird (banterbird.app) Terms of Service - eligibility, acceptable use, moderation, and your rights on our anonymous chat platform.",
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" updated="July 3, 2026">
      <p>
        Welcome to BanterBird. By using our anonymous chat service, you agree to these Terms of
        Service. If you do not agree, please do not use the service.
      </p>
      <h2>Eligibility</h2>
      <p>
        You must meet the minimum age requirement shown at signup. BanterBird is intended for adults
        and is not directed at children.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Be respectful to other users.</li>
        <li>Do not harass, threaten, or share illegal content.</li>
        <li>Do not spam, scam, or attempt to obtain personal information from others.</li>
        <li>Do not use bots or automation to abuse the matching system.</li>
      </ul>
      <h2>Anonymous chat</h2>
      <p>
        Conversations are between strangers. We do not guarantee the identity, intentions, or
        behavior of other users. Use caution and report abusive behavior.
      </p>
      <h2>Moderation</h2>
      <p>
        We may restrict access, block devices or IP addresses, and review reports to keep the
        community safe. See our{" "}
        <Link href="/legal/community" className="text-violet-600 underline-offset-2 hover:underline">
          Community Guidelines
        </Link>
        .
      </p>
      <h2>Disclaimer</h2>
      <p>
        BanterBird is provided &quot;as is&quot; without warranties. We are not liable for user-generated
        content or interactions between users.
      </p>
      <h2>Changes</h2>
      <p>We may update these terms. Continued use after changes constitutes acceptance.</p>
    </LegalPageShell>
  );
}
