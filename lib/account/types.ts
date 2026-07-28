import type { SelfGender, WantsGender } from "@/lib/types/chat";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  self_gender: SelfGender | null;
  wants_gender: WantsGender | null;
};

export type AccountState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "named"; profile: Profile };
