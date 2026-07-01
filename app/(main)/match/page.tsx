import type { Metadata } from "next";
import { MatchLobby } from "@/components/match/MatchLobby";

export const metadata: Metadata = {
  title: "Match",
};

export default function MatchPage() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-4 sm:px-6">
      <div className="pointer-events-auto w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <MatchLobby />
      </div>
    </div>
  );
}
