import type { MatchMode } from "@/lib/ops/bot-settings";
import type { SelfGender, WantsGender } from "@/lib/types/chat";

export function computeEffectiveIncludeAi(matchMode: MatchMode, includeAiMatch: boolean): boolean {
  if (matchMode === "humans_only") return false;
  if (matchMode === "hidden_bots") return true;
  return includeAiMatch;
}

export function resolveActiveGenders(
  hideGenderFilters: boolean,
  storedSelfGender: SelfGender | null,
  storedWantsGender: WantsGender | null,
  generated: { self: SelfGender; wants: WantsGender } | null,
): { activeSelfGender: SelfGender | undefined; activeWantsGender: WantsGender | undefined } {
  if (hideGenderFilters) {
    return {
      activeSelfGender: generated?.self,
      activeWantsGender: generated?.wants ?? "any",
    };
  }
  return {
    activeSelfGender: storedSelfGender ?? undefined,
    activeWantsGender: storedWantsGender ?? undefined,
  };
}

export function canStartMatching(
  hideGenderFilters: boolean,
  matchRequested: boolean,
  activeSelfGender: SelfGender | undefined,
  activeWantsGender: WantsGender | undefined,
): boolean {
  if (hideGenderFilters) {
    return matchRequested && Boolean(activeSelfGender) && Boolean(activeWantsGender);
  }
  return Boolean(activeSelfGender) && Boolean(activeWantsGender);
}
