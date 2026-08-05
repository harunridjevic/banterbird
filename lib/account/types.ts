import type { SelfGender, WantsGender } from "@/lib/types/chat";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  self_gender: SelfGender | null;
  wants_gender: WantsGender | null;
  /** True while PRO period is active (server-maintained). */
  is_pro: boolean;
  /** ISO end of current PRO period, or null. */
  pro_until: string | null;
};

/** Whether the profile currently has active PRO (client-side check). */
export function isProActive(profile: Pick<Profile, "is_pro" | "pro_until">): boolean {
  if (!profile.is_pro || !profile.pro_until) return false;
  return new Date(profile.pro_until).getTime() > Date.now();
}

export type AccountState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "named"; profile: Profile };
