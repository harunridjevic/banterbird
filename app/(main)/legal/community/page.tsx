import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "BanterBird Community Guidelines: Be kind, respectful, and safe. Learn about our rules against harassment, illegal content, and spam to ensure a positive chat experience.",
};

export default function CommunityPage() {
  return (
    <LegalPageShell title="Community Guidelines" updated="July 3, 2026">
      <p>BanterBird works best when everyone feels safe. Please follow these guidelines.</p>
      <h2>Be kind</h2>
      <p>Treat strangers with respect. Disagreements happen. Stay civil or skip the chat.</p>
      <h2>No harassment</h2>
      <p>
        Bullying, hate speech, sexual harassment, and targeted abuse are not allowed. Use the report
        button if someone crosses the line.
      </p>
      <h2>No illegal content</h2>
      <p>Do not share or solicit illegal material, including content involving minors.</p>
      <h2>Protect privacy</h2>
      <p>
        Do not pressure others to share personal information (real name, address, social accounts,
        etc.).
      </p>
      <h2>No spam</h2>
      <p>Repeated unsolicited messages, scams, and bot-like behavior may result in restrictions.</p>
      <h2>Reporting</h2>
      <p>
        Reports are reviewed by our team. False or malicious reports may also lead to action. You can
        temporarily block a user for the current session when reporting.
      </p>
    </LegalPageShell>
  );
}
