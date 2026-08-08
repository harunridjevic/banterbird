import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { loadAppSettings } from "@/lib/ops/app-settings";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.app";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "BanterBird refund policy for PRO subscriptions. Understand when refunds are available and how to request one.",
  alternates: { canonical: "/legal/refund" },
  robots: { index: true, follow: true },
  openGraph: {
    url: `${baseUrl}/legal/refund`,
    title: "Refund Policy · BanterBird",
    description: "BanterBird refund policy for PRO subscriptions.",
    siteName: "BanterBird",
    images: [{ url: "/logo_search.png", width: 1200, height: 630, alt: "BanterBird" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Refund Policy · BanterBird",
    description: "BanterBird refund policy for PRO subscriptions.",
    images: ["/logo_search.png"],
  },
};

export default async function RefundPage() {
  const settings = await loadAppSettings();
  const price = settings.billing.proPriceUsd;

  return (
    <LegalPageShell title="Refund Policy" updated="August 8, 2026">
      <p>
        This policy applies to BanterBird PRO subscriptions purchased through our website at
        banterbird.app. Payments are processed by Paddle.com, our Merchant of Record.
      </p>

      <h2>Subscription billing</h2>
      <p>
        BanterBird PRO is billed on a recurring monthly basis at{" "}
        <strong>${price}/month</strong>. When you subscribe, you are charged for the current
        billing period immediately. Your subscription renews automatically at the start of each new
        period unless you cancel before the renewal date.
      </p>

      <h2>Cancellations</h2>
      <p>
        You may cancel your subscription at any time from your account settings. Cancelling stops
        future charges. Your PRO access continues until the end of the billing period you have
        already paid for. We do not issue partial refunds for unused days within an active billing
        period.
      </p>

      <h2>Refund eligibility</h2>
      <p>We offer refunds in the following circumstances:</p>
      <ul>
        <li>
          <strong>Duplicate charge:</strong> If you were charged more than once for the same
          subscription period due to a technical error, we will refund the duplicate charge in full.
        </li>
        <li>
          <strong>Charge after cancellation:</strong> If you were charged after a confirmed
          cancellation, we will refund the erroneous charge.
        </li>
        <li>
          <strong>Service unavailability:</strong> If BanterBird PRO was completely inaccessible for
          a significant portion of a billing period due to an issue on our end, we will review
          refund requests on a case-by-case basis.
        </li>
        <li>
          <strong>Within 3 days of first purchase:</strong> If you subscribed for the first time and
          have not made significant use of PRO features, you may request a refund within 3 days of
          the initial charge.
        </li>
      </ul>
      <p>
        Refunds are not available for renewal charges after the 3-day first-purchase window, change
        of mind, or if your account was suspended or terminated for violations of our{" "}
        <Link href="/legal/terms" className="text-violet-600 underline-offset-2 hover:underline">
          Terms of Service
        </Link>
        .
      </p>

      <h2>How to request a refund</h2>
      <p>
        Email{" "}
        <a
          href="mailto:support@banterbird.app"
          className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
        >
          support@banterbird.app
        </a>{" "}
        with the subject line <strong>Refund Request</strong> and include the email address
        associated with your account and a brief description of the reason. We aim to respond within
        3 business days.
      </p>
      <p>
        Because Paddle is our Merchant of Record, approved refunds are processed by Paddle and
        returned to your original payment method. Processing time depends on your bank or card
        issuer, typically 5 to 10 business days.
      </p>

      <h2>Contact</h2>
      <p>
        For any billing questions, visit our{" "}
        <Link href="/contact" className="text-violet-600 underline-offset-2 hover:underline">
          contact page
        </Link>{" "}
        or email{" "}
        <a
          href="mailto:support@banterbird.app"
          className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
        >
          support@banterbird.app
        </a>
        .
      </p>
    </LegalPageShell>
  );
}
