"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Flag, X } from "lucide-react";
import { getDeviceId } from "@/lib/moderation/device-id";
import { blockUserForSession } from "@/lib/moderation/session-block";
import type { MessageRow } from "@/lib/types/chat";
import { isBotMessage } from "@/components/chat/ghost-watch";

const REPORT_REASONS = [
  "Harassment or bullying",
  "Hate speech",
  "Spam or scam",
  "Threats or violence",
  "Underage user",
  "Other",
] as const;

type Props = {
  roomId: string;
  peerId: string | null;
  isAiRoom: boolean;
  messages: MessageRow[];
  selfId: string;
  onReported: () => void;
  onClose: () => void;
};

export function ReportUserDialog({
  roomId,
  peerId,
  isAiRoom,
  messages,
  selfId,
  onReported,
  onClose,
}: Props) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [step, setStep] = useState<"reason" | "block">("reason");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcript = messages.map((m) => ({
    role: isBotMessage(m) ? "bot" : m.user_id === selfId ? "self" : "peer",
    content: m.content,
    at: m.created_at,
  }));

  const submitReport = async (blockForSession: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const finalReason = reason === "Other" ? customReason.trim() || "Other" : reason;
      const res = await fetch("/api/chat/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          reportedUserId: isAiRoom ? null : peerId,
          reason: finalReason,
          transcript,
          reporterDeviceId: getDeviceId(),
          blockForSession,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Report failed");
        return;
      }
      const data = (await res.json()) as { reportedUserId?: string | null };
      if (blockForSession && data.reportedUserId) {
        blockUserForSession(data.reportedUserId);
      }
      onReported();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy-950/60 p-4 backdrop-blur-sm sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-navy-200/60 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-navy-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-rose-500" aria-hidden />
            <h2 className="text-lg font-semibold text-navy-950 dark:text-navy-50">Report user</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-navy-500 hover:bg-navy-100 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === "reason" ? (
          <>
            <p className="mt-2 text-sm text-navy-600 dark:text-navy-400">
              This will skip the chat and send a transcript to our moderation team.
            </p>
            <div className="mt-4 space-y-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-200/60 px-3 py-2.5 dark:border-white/10"
                >
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-rose-500"
                  />
                  <span className="text-sm text-navy-800 dark:text-navy-200">{r}</span>
                </label>
              ))}
            </div>
            {reason === "Other" ? (
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe what happened…"
                rows={3}
                className="mt-3 w-full resize-none rounded-xl border border-navy-200/60 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-navy-950"
              />
            ) : null}
            {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                if (isAiRoom || !peerId) {
                  void submitReport(false);
                } else {
                  setStep("block");
                }
              }}
              className="mt-4 w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit report & skip"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-navy-600 dark:text-navy-400">
              Don&apos;t want to be matched with this person again during this session?
            </p>
            {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitReport(true)}
                className="w-full rounded-2xl bg-navy-900 px-4 py-3 text-sm font-semibold text-white dark:bg-navy-100 dark:text-navy-950 disabled:opacity-50"
              >
                Yes, block for this session
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitReport(false)}
                className="w-full rounded-2xl border border-navy-200/80 px-4 py-3 text-sm font-medium text-navy-700 dark:border-white/10 dark:text-navy-200 disabled:opacity-50"
              >
                No, just report
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
