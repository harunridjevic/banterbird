const SESSION_BLOCK_KEY = "banterbird:sessionBlockedUsers";

export function getSessionBlockedUsers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SESSION_BLOCK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function blockUserForSession(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  const blocked = getSessionBlockedUsers();
  if (!blocked.includes(userId)) {
    blocked.push(userId);
    sessionStorage.setItem(SESSION_BLOCK_KEY, JSON.stringify(blocked));
  }
}

export function unblockUserForSession(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  const blocked = getSessionBlockedUsers().filter((id) => id !== userId);
  sessionStorage.setItem(SESSION_BLOCK_KEY, JSON.stringify(blocked));
}

export function isUserBlockedForSession(userId: string): boolean {
  return getSessionBlockedUsers().includes(userId);
}
