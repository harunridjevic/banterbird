import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { loadAppSettings } from "@/lib/ops/app-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read BanterBird (banterbird.app) Terms of Service - eligibility, acceptable use, moderation, and your rights on our anonymous chat platform.",
  alternates: { canonical: "/legal/terms" },
  robots: { index: true, follow: true },
  openGraph: {
    url: "https://banterbird.app/legal/terms",
    title: "Terms of Service · BanterBird",
    description: "BanterBird Terms of Service: eligibility, acceptable use, moderation, and your rights on our anonymous chat platform.",
    siteName: "BanterBird",
    images: [{ url: "/logo_search.png", width: 1200, height: 630, alt: "BanterBird" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service · BanterBird",
    description: "BanterBird Terms of Service: eligibility, acceptable use, moderation, and your rights on our anonymous chat platform.",
    images: ["/logo_search.png"],
  },
};

export default async function TermsPage() {
  const settings = await loadAppSettings();
  const price = settings.billing.proPriceUsd;

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
      <h2>BanterBird PRO — paid subscriptions</h2>
      <p>
        BanterBird offers an optional paid subscription called BanterBird PRO. By subscribing you
        agree to the following:
      </p>
      <ul>
        <li>
          Subscriptions are billed on a recurring monthly basis at the price shown at checkout
          ($<span>{price}</span>/month). Pricing may vary by country due to local tax and currency.
        </li>
        <li>
          Payments are processed by Paddle.com, our Merchant of Record. Paddle handles payment
          processing, invoicing, and tax compliance on our behalf.
        </li>
        <li>
          You may cancel your subscription at any time from your account settings. Cancellation
          stops future billing and your PRO access continues until the end of the period already
          paid for. No partial refunds are issued for unused time within a billing period.
        </li>
        <li>
          Refunds are handled in accordance with our{" "}
          <Link href="/legal/refund" className="text-violet-600 underline-offset-2 hover:underline">
            Refund Policy
          </Link>
          .
        </li>
        <li>
          We reserve the right to suspend or terminate PRO access for violations of these Terms,
          without refund.
        </li>
      </ul>
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
