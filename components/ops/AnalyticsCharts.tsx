"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsSnapshot } from "@/lib/ops/analytics-types";

function shortDate(iso: string): string {
  const d = iso.slice(5);
  return d;
}

type ChartProps = {
  snapshot: AnalyticsSnapshot;
};

export function UniqueUsersChart({ snapshot }: ChartProps) {
  const data = snapshot.series.uniqueUsersByDay.map((p) => ({
    date: shortDate(p.date),
    users: p.value,
  }));

  if (data.length === 0) {
    return <EmptyChart />;
  }

  return (
    <ChartShell title="Unique users per day">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="users"
            name="Unique users"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function RoomsChart({ snapshot }: ChartProps) {
  const data = snapshot.series.roomsByDay.map((p) => ({
    date: shortDate(p.date),
    Human: p.human,
    Bot: p.bot,
  }));

  if (data.length === 0) {
    return <EmptyChart />;
  }

  return (
    <ChartShell title="Rooms created (human vs bot)">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
          <Bar dataKey="Human" stackId="rooms" fill="#34d399" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Bot" stackId="rooms" fill="#fbbf24" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function ApiCostChart({ snapshot }: ChartProps) {
  const data = (snapshot.series.apiCostByDay ?? []).map((p) => ({
    date: shortDate(p.date),
    Cost: p.costUsd,
    Tokens: p.tokens,
  }));

  if (data.length === 0) {
    return <EmptyChart message="No LLM API cost logged yet." />;
  }

  return (
    <ChartShell title="LLM API cost per day">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
          <YAxis
            yAxisId="cost"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            tickFormatter={(v: number) => `$${v}`}
          />
          <YAxis
            yAxisId="tokens"
            orientation="right"
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickLine={false}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip content={<CostChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
          <Bar yAxisId="cost" dataKey="Cost" fill="#fbbf24" radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="tokens"
            type="monotone"
            dataKey="Tokens"
            name="Tokens"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

function CostChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-navy-950 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-navy-300">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name === "Cost" ? `$${p.value.toFixed(4)}` : p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export function ApiUsageChart({ snapshot }: ChartProps) {
  const data = snapshot.series.apiCallsByDay.map((p) => ({
    date: shortDate(p.date),
    Calls: p.calls,
    Errors: p.errors,
  }));

  if (data.length === 0) {
    return <EmptyChart message="No API calls logged yet." />;
  }

  return (
    <ChartShell title="AI API calls per day">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
          <Bar dataKey="Calls" fill="#38bdf8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Errors" fill="#f87171" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <h3 className="text-sm font-medium text-navy-200">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function EmptyChart({ message = "No data for this period." }: { message?: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-navy-500">
      {message}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-navy-950 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-navy-300">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}
