import type { Metadata } from "next";
import { MatchLobby } from "@/components/match/MatchLobby";
import { AgeGateWrapper } from "@/components/legal/AgeGateWrapper";
import { SignInNudge } from "@/components/account/SignInNudge";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.app";

export const metadata: Metadata = {
  title: {
    absolute: "BanterBird - Free Anonymous Chat Online (No Signup)",
  },
  description:
    "BanterBird is free anonymous chat online with no signup and no download. Start instant 1-on-1 anonymous text chat with random people. Private, fast, and built for real conversation.",
  keywords: [
    "banterbird",
    "banterbird.app",
    "banter bird",
    "google ai banterbird",
    "banterbird anonymous chat",
    "anonymous chat",
    "anonymous chat online",
    "free anonymous chat",
    "anonymous text chat",
    "chat anonymously",
    "anonymous messaging",
    "random anonymous chat",
    "online anonymous chat",
    "instant anonymous chat",
    "anonymous chat no registration",
    "chat without account",
    "omegle alternative",
    "random text chat",
    "1 on 1 anonymous chat",
    "private anonymous chat",
    "anonymous chat app",
    "free random chat",
    "chat with random people",
    "anonymous social chat",
    "no signup chat",
    "AI chat practice",
    "anonymous AI chat",
  ],
  alternates: {
    canonical: `${baseUrl}`,
  },
  openGraph: {
    url: baseUrl,
    title: "BanterBird - Free Anonymous Chat Online",
    description:
      "Free anonymous chat online, no signup. Instant 1-on-1 anonymous text chat on BanterBird.",
    siteName: "BanterBird",
    images: [
      {
        url: "/logo_search.png",
        width: 1200,
        height: 630,
        alt: "BanterBird - Anonymous Chat",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BanterBird - Free Anonymous Chat Online",
    description:
      "Free anonymous chat online, no signup. Instant 1-on-1 anonymous text chat on BanterBird.",
    images: ["/logo_search.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HomePage() {
  return (
    <AgeGateWrapper>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-6 sm:px-6">
        <div className="w-full max-w-4xl">
          <h1 className="sr-only">BanterBird - free anonymous chat online</h1>
          <MatchLobby />
          <SignInNudge />
        </div>
      </div>
    </AgeGateWrapper>
  );
}
