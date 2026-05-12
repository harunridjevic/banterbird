import type { Metadata } from "next";
import { MatchLobby } from "@/components/match/MatchLobby";

export const metadata: Metadata = {
  title: "Match",
};

export default function MatchPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <MatchLobby />
    </div>
  );
}
