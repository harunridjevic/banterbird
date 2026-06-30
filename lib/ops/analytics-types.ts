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

export type AnalyticsSnapshot = {
  windowDays: number;
  sinceUtc: string;
  computedAtUtc: string;
  uniqueUsers: number;
  avgUserSessionMinutes: number | null;
  humanChats: number;
  botChats: number;
  totalRooms: number;
  avgHumanRoomMinutes: number | null;
  avgBotRoomMinutes: number | null;
  onlineUsersNow: number;
  recurringUsers: number;
  apiUsage: {
    totalCalls: number;
    errorCalls: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    byProvider: Record<string, number>;
  };
  series: {
    uniqueUsersByDay: DayPoint[];
    roomsByDay: RoomsDayPoint[];
    apiCallsByDay: ApiDayPoint[];
  };
};

export const METRIC_TOOLTIPS = {
  uniqueUsers:
    "Distinct users who created a room or sent a message during the selected time window (UTC).",
  avgUserSessionMinutes:
    "Average total time each user spent in all their rooms combined — from room open to close (or now if still active).",
  humanChats: "Rooms matched with a real person (is_ai_room = false).",
  botChats: "Practice bot rooms created when no human match was found.",
  totalRooms: "All rooms created during the selected window, human + bot.",
  avgHumanRoomMinutes:
    "Average duration of human-human rooms — from created_at to ended_at (or now if still open).",
  avgBotRoomMinutes:
    "Average duration of AI practice rooms — from created_at to ended_at (or now if still open).",
  onlineUsersNow:
    "Users with an active app tab who sent a heartbeat in the last 2 minutes.",
  recurringUsers:
    "Users who were active on 2 or more different calendar days (UTC) in the window.",
  apiTotalCalls: "Total AI reply API calls (Gemini/OpenAI) during the window.",
  apiSuccessRate: "Share of AI API calls that completed without an error response.",
  apiAvgLatency: "Average round-trip time for AI API calls in milliseconds.",
} as const;

export function resolvePeriodDays(period: AnalyticsPeriod, customDays: number): number {
  if (period === "custom") {
    return Math.min(365, Math.max(1, customDays || 30));
  }
  return PERIOD_DAYS[period];
}

export function periodLabel(period: AnalyticsPeriod, days: number): string {
  switch (period) {
    case "today":
      return "Today";
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
