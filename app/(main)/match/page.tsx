import type { Metadata } from "next";
import { MatchLobby } from "@/components/match/MatchLobby";
import { AgeGateWrapper } from "@/components/legal/AgeGateWrapper";

export const metadata: Metadata = {
  title: "Find Your Match - Anonymous Chat",
  description: "Start matching with random strangers instantly. No registration required. Choose your preferences and begin chatting in seconds.",
};

export default function MatchPage() {
  return (
    <AgeGateWrapper>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 sm:px-6">
        <div className="w-full max-w-2xl -translate-y-5 sm:-translate-y-8">
          <MatchLobby />
        </div>
      </div>
    </AgeGateWrapper>
  );
}
