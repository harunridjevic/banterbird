import type { Metadata } from "next";
import { MatchLobby } from "@/components/match/MatchLobby";
import { AgeGateWrapper } from "@/components/legal/AgeGateWrapper";
import { SignInNudge } from "@/components/account/SignInNudge";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.app";

export const metadata: Metadata = {
  title: {
    absolute: "BanterBird — Meet Someone New. Start a Conversation.",
  },
  description:
    "BanterBird is a simple way to anonymously chat with people from around the world. No signup, no download — just pick your preferences and start talking.",
  keywords: [
    "banterbird",
    "banterbird.app",
    "banter bird",
    "banterbird anonymous chat",
    "anonymous chat",
    "anonymous chat online",
    "free anonymous chat",
    "anonymous text chat",
    "chat anonymously",
    "random chat",
    "random chat online",
    "chat with strangers",
    "meet new people online",
    "make new friends online",
    "online chat",
    "global chat",
    "anonymous social network",
    "random conversation",
    "omegle alternative",
    "random text chat",
    "1 on 1 anonymous chat",
    "private anonymous chat",
    "anonymous chat app",
    "free random chat",
    "chat with random people",
    "no signup chat",
  ],
  alternates: {
    canonical: `${baseUrl}`,
  },
  openGraph: {
    url: baseUrl,
    title: "BanterBird — Meet Someone New. Start a Conversation.",
    description:
      "Anonymously chat with people from around the world. No signup needed — just start talking.",
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
    title: "BanterBird — Meet Someone New. Start a Conversation.",
    description:
      "Anonymously chat with people from around the world. No signup needed — just start talking.",
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
      <div className="flex h-full w-full items-center justify-center px-4 pb-[14%] pt-8 sm:px-6 sm:pb-[6%]">
        <div className="flex w-full max-w-4xl flex-col items-center">
          <h1 className="sr-only">BanterBird — anonymous chat with people around the world</h1>
          <MatchLobby />
          <SignInNudge />
        </div>
      </div>
    </AgeGateWrapper>
  );
}
