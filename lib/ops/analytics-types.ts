export type AnalyticsPeriod = "today" | "week" | "month" | "year" | "custom";

export const PERIOD_DAYS: Record<Exclude<AnalyticsPeriod, "custom">, number> = {
  today: 1,
  week: 7,
  month: 30,
  year: 365,
};

export type DayPoint = { date: string; value: number };
export type RoomsDayPoint = { date: string; human: number; bot: number; total: number };
export type ApiDayPoint = { date: string; calls: number; errors: number };
export type ApiCostDayPoint = { date: string; costUsd: number; tokens: number };

export type AnalyticsSnapshot = {
  windowDays: number;
  calendarToday?: boolean;
  sinceUtc: string;
  computedAtUtc: string;
  uniqueUsers: number;
  avgUserSessionMinutes: number | null;
  totalUserSessionMinutes: number;
  humanChats: number;
  botChats: number;
  totalRooms: number;
  avgHumanRoomMinutes: number | null;
  avgBotRoomMinutes: number | null;
  onlineUsersNow: number;
  recurringUsers: number;
  /** Share of new users who finished their first-ever chat in this period and never opened another. */
  bounceRate: number | null;
  bouncedUsers: number;
  firstChatUsers: number;
  /** New users whose first-ever chat in this period has ended (churn denominator). */
  firstChatEndedUsers: number;
  /** New users who finished their first chat and started at least one more room. */
  firstChatRetainedUsers: number;
  /** Ended human room left in <30s or with no messages (legacy room metric). */
  roomBounceRate: number | null;
  bouncedRooms: number;
  endedHumanRooms: number;
  apiUsage: {
    totalCalls: number;
    errorCalls: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    byProvider: Record<string, number>;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    usersWithApiCalls: number;
    avgTokensPerUser: number | null;
  };
  series: {
    uniqueUsersByDay: DayPoint[];
    roomsByDay: RoomsDayPoint[];
    apiCallsByDay: ApiDayPoint[];
    apiCostByDay: ApiCostDayPoint[];
  };
};

export const METRIC_TOOLTIPS = {
  uniqueUsers:
    "Distinct users who created a room or sent a message during the selected time window (UTC).",
  avgUserSessionMinutes:
    "Average app-wide online time per user — accumulated from heartbeats while browsing (not only in rooms).",
  humanChats: "Rooms matched with a real person (is_ai_room = false).",
  botChats: "Practice bot rooms created when no human match was found.",
  totalRooms: "All rooms created during the selected window, human + bot.",
  avgHumanRoomMinutes:
    "Average duration of human-human rooms — from created_at to ended_at (or now if still open).",
  avgBotRoomMinutes:
    "Average duration of AI practice rooms — from created_at to ended_at (or now if still open).",
  onlineUsersNow:
    "Live count from Supabase Realtime presence — same source as the main app navbar.",
  recurringUsers:
    "Users who visited or chatted on 2 or more different calendar days (UTC) in the window.",
  totalUserSessionMinutes:
    "Combined app-wide online time for all users — accumulated from heartbeats while browsing (not only in rooms).",
  bounceRate:
    "Share of new users (first-ever chat started in this period) who finished that chat and never opened another. Not total bot/human room count.",
  bouncedUsers:
    "New users who ended their first-ever chat in this period and never started a second room.",
  firstChatUsers:
    "Users whose very first chat on BanterBird started in this period (bot or human).",
  firstChatEndedUsers:
    "New users whose first-ever chat started in this period and has ended. Churn denominator, not total rooms.",
  firstChatRetainedUsers:
    "New users who finished their first chat and then started at least one more room.",
  roomBounceRate:
    "Share of ended human-human rooms where someone left within 30 seconds or no one sent a message.",
  apiTotalCalls: "Total AI reply API calls (Groq/Gemini/OpenAI/local) during the window.",
  apiSuccessRate:
    "Share of logged API calls where an LLM provider returned a response (excludes local fallbacks).",
  apiAvgLatency: "Average round-trip time for AI API calls in milliseconds.",
  apiTotalTokens: "Total input + output tokens consumed by Groq/Gemini/OpenAI calls in the window.",
  apiEstimatedCost:
    "Estimated API spend in USD based on token counts and configured per-provider rates.",
  apiAvgTokensPerUser: "Average tokens used per user who triggered at least one AI API call.",
} as const;

export function resolvePeriodDays(period: AnalyticsPeriod, customDays: number): number {
  if (period === "custom") {
    return Math.min(365, Math.max(1, customDays || 30));
  }
  return PERIOD_DAYS[period];
}

export function formatSinceUtc(iso: string): string {
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return iso;
  }
}

export function periodLabel(period: AnalyticsPeriod, days: number): string {
  switch (period) {
    case "today":
      return "Today (UTC calendar day)";
    case "week":
      return "Last 7 days";
    case "month":
      return "Last 30 days";
    case "year":
      return "Last 365 days";
    case "custom":
      return `Last ${days} days`;
  }
}
