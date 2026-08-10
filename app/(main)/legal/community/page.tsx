import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description:
    "BanterBird (banterbird.app) Community Guidelines - be kind, respectful, and safe. Rules against harassment, illegal content, and spam.",
  alternates: { canonical: "/legal/community" },
  robots: { index: true, follow: true },
  openGraph: {
    url: "https://banterbird.app/legal/community",
    title: "Community Guidelines · BanterBird",
    description: "BanterBird Community Guidelines: be kind, stay safe, no harassment, no illegal content.",
    siteName: "BanterBird",
    images: [{ url: "/logo_search.png", width: 1200, height: 630, alt: "BanterBird" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Community Guidelines · BanterBird",
    description: "BanterBird Community Guidelines: be kind, stay safe, no harassment, no illegal content.",
    images: ["/logo_search.png"],
  },
};

export default function CommunityPage() {
  return (
    <LegalPageShell title="Community Guidelines" updated="July 3, 2026">
      <p>BanterBird works best when everyone feels welcome and respected. Please follow these guidelines.</p>
      <h2>Be kind</h2>
      <p>Treat others with respect. Disagreements happen. Stay civil or skip the chat.</p>
      <h2>No harassment</h2>
      <p>
        Bullying, hate speech, unwanted advances, and targeted abuse are not allowed. Use the report
        button if someone crosses the line.
      </p>
      <h2>No inappropriate sexual content</h2>
      <p>
        Sending unsolicited sexual messages or images, soliciting sexual content, or engaging in
        sexual conversations with anyone who has not consented is prohibited and may result in a
        permanent ban.
      </p>
      <h2>No illegal content</h2>
      <p>
        Do not share or solicit illegal material of any kind. Content that sexually exploits or
        endangers minors is strictly forbidden and will be reported to relevant authorities.
      </p>
      <h2>Protect your privacy</h2>
      <p>
        Never share your real name, home address, phone number, passwords, financial information, or
        social media accounts in chat. Do not pressure others to share theirs.
      </p>
      <h2>No spam or scams</h2>
      <p>Repeated unsolicited messages, scam attempts, and bot-like behavior may result in restrictions.</p>
      <h2>Stay safe</h2>
      <ul>
        <li>Leave any conversation that makes you feel uncomfortable. It is always okay to skip.</li>
        <li>Never share passwords or financial details with anyone.</li>
        <li>Report behavior that seems threatening, abusive, or illegal.</li>
        <li>Block users when you do not want to interact with them again.</li>
      </ul>
      <h2>Reporting</h2>
      <p>
        Reports are reviewed by our team. Use the <strong>Report</strong> button inside any chat
        room. False or malicious reports may also lead to action against the reporter.
      </p>
    </LegalPageShell>
  );
}
