import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the BanterBird team. Questions, feedback, or support - email us at support@banterbird.app.",
  alternates: { canonical: "/contact" },
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  return (
    <LegalPageShell title="Contact Us" updated="July 22, 2026">
      <p>
        Have a question, feedback, or need support? We would love to hear from you. Reach out any
        time and we will get back to you as soon as we can.
      </p>

      <h2>Support</h2>
      <p>
        For general questions, help with your account, or anything else, email us at{" "}
        <a
          href="mailto:support@banterbird.app"
          className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
        >
          support@banterbird.app
        </a>
      </p>

      <h2>Business inquiries</h2>
      <p>
        For partnerships, press, or commercial inquiries, reach us at{" "}
        <a
          href="mailto:business@banterbird.app"
          className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
        >
          business@banterbird.app
        </a>
      </p>

      <h2>Reporting abuse</h2>
      <p>
        If you need to report a user for abusive or harmful behavior, please use the{" "}
        <strong>Report</strong> button inside the chat room. For urgent safety concerns you can also
        email our support address directly.
      </p>

      <h2>Community guidelines</h2>
      <p>
        Before reaching out about a moderation decision, please review our{" "}
        <Link
          href="/legal/community"
          className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
        >
          Community Guidelines
        </Link>
        .
      </p>
    </LegalPageShell>
  );
}
