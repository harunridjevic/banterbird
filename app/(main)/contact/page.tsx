import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the BanterBird team. Questions, feedback, or support — email us at banterbirdchat@gmail.com.",
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

      <h2>Email</h2>
      <p>
        The best way to reach us is by email:{" "}
        <a
          href="mailto:banterbirdchat@gmail.com"
          className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
        >
          banterbirdchat@gmail.com
        </a>
      </p>

      <h2>Reporting abuse</h2>
      <p>
        If you need to report a user for abusive or harmful behavior, please use the{" "}
        <strong>Report</strong> button inside the chat room. For urgent safety concerns you can also
        email us directly.
      </p>

      <h2>Business inquiries</h2>
      <p>
        For partnerships, press, or business inquiries, send us an email with the subject line
        &quot;Business inquiry&quot; and we will route it to the right person.
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
