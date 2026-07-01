import type { Metadata } from "next";
import { MatchLobby } from "@/components/match/MatchLobby";

export const metadata: Metadata = {
  title: "Match",
};

export default function MatchPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      <div className="w-full max-w-2xl">
        <MatchLobby />
      </div>
    </div>
  );
}
