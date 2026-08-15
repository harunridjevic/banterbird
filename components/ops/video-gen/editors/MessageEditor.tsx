"use client";

/**
 * MessageEditor
 *
 * Edits a list of ChatMessage objects (stranger or user response).
 * Supports:
 *  - Add / remove messages
 *  - Edit text
 *  - Attach / replace / remove image
 *  - Adjust delayMs per message
 *  - Drag-to-reorder (CSS-only handle, no heavy DnD library)
 */

import { useRef } from "react";
import { ImagePlus, Trash2, Plus, GripVertical, X } from "lucide-react";
import type { ChatMessage, MessageSender } from "@/lib/ops/video-generator-types";

interface Props {
  messages: ChatMessage[];
  sender: MessageSender;
  onChange: (messages: ChatMessage[]) => void;
  /** When true each message shows a stranger/you toggle so the section can
   *  contain a mixed back-and-forth conversation (e.g. post-choice exchange). */
  allowSenderToggle?: boolean;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-navy-500 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition";

export function MessageEditor({ messages, sender, onChange, allowSenderToggle = false }: Props) {
  const fileRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  function addMessage() {
    const last = messages.at(-1);
    // In toggle mode, default new messages to the opposite of the last one
    // so it naturally continues a back-and-forth exchange.
    const newSender: MessageSender = allowSenderToggle && last
      ? (last.sender === "me" ? "stranger" : "me")
      : sender;
    onChange([
      ...messages,
      {
        id: uid(),
        sender: newSender,
        text: "",
        delayMs: last ? last.delayMs + 1200 : 800,
      },
    ]);
  }

  function removeMessage(id: string) {
    onChange(messages.filter((m) => m.id !== id));
  }

  function updateField<K extends keyof ChatMessage>(
    id: string,
    key: K,
    value: ChatMessage[K]
  ) {
    onChange(messages.map((m) => (m.id === id ? { ...m, [key]: value } : m)));
  }

  async function handleImage(id: string, file: File) {
    if (file.size > 5 * 1024 * 1024) return; // silently skip >5 MB
    const dataUrl = await readFileAsDataUrl(file);
    updateField(id, "imageUrl", dataUrl);
  }

  function removeImage(id: string) {
    onChange(
      messages.map((m) =>
        m.id === id ? { ...m, imageUrl: undefined } : m
      )
    );
  }

  const label = sender === "stranger" ? "Stranger" : "You";
  const accentClass =
    sender === "stranger"
      ? "border-teal-500/20 bg-teal-950/10"
      : "border-violet-500/20 bg-violet-950/10";

  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg, idx) => {
        const msgSender = allowSenderToggle ? msg.sender : sender;
        const msgLabel = msgSender === "stranger" ? "Stranger" : "You";
        const msgAccent = msgSender === "stranger"
          ? "border-teal-500/20 bg-teal-950/10"
          : "border-violet-500/20 bg-violet-950/10";

        return (
        <div
          key={msg.id}
          className={`rounded-xl border p-4 ${msgAccent}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-navy-600 cursor-grab" aria-hidden />
              {allowSenderToggle ? (
                /* Sender toggle: click to flip between Stranger / You */
                <button
                  type="button"
                  onClick={() =>
                    updateField(
                      msg.id,
                      "sender",
                      msg.sender === "stranger" ? "me" : "stranger"
                    )
                  }
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition ${
                    msg.sender === "stranger"
                      ? "border-teal-500/40 bg-teal-950/30 text-teal-400 hover:bg-teal-950/60"
                      : "border-violet-500/40 bg-violet-950/30 text-violet-400 hover:bg-violet-950/60"
                  }`}
                  title="Click to toggle Stranger / You"
                >
                  {msgLabel} · msg {idx + 1}
                  <span className="opacity-50">⇄</span>
                </button>
              ) : (
                <span className="text-xs font-semibold uppercase tracking-wide text-navy-400">
                  {label} · msg {idx + 1}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeMessage(msg.id)}
              className="rounded-lg p-1.5 text-navy-500 hover:bg-rose-950/40 hover:text-rose-400 transition"
              aria-label="Remove message"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Text */}
          <textarea
            rows={2}
            value={msg.text}
            onChange={(e) => updateField(msg.id, "text", e.target.value)}
            placeholder={`${msgLabel}'s message…`}
            className={`${FIELD} resize-none`}
          />

          {/* Image preview or attach */}
          <div className="mt-2.5">
            {msg.imageUrl ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={msg.imageUrl}
                  alt="Attached"
                  className="h-20 w-auto rounded-lg object-cover border border-white/10"
                />
                <button
                  type="button"
                  onClick={() => removeImage(msg.id)}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-navy-900 text-white border border-white/10 hover:bg-rose-600 transition"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRefs.current.get(msg.id)?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-navy-400 hover:bg-white/10 hover:text-white transition"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Attach image
              </button>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              ref={(el) => {
                if (el) fileRefs.current.set(msg.id, el);
                else fileRefs.current.delete(msg.id);
              }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImage(msg.id, f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Delay */}
          <div className="mt-3 flex items-center gap-3">
            <label className="text-[11px] font-medium text-navy-500 shrink-0">
              Delay (ms)
            </label>
            <input
              type="number"
              min={0}
              max={60000}
              step={100}
              value={msg.delayMs}
              onChange={(e) =>
                updateField(
                  msg.id,
                  "delayMs",
                  Math.max(0, Number(e.target.value))
                )
              }
              className="w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white outline-none focus:border-violet-500/50"
            />
            <span className="text-[11px] text-navy-600">from video start</span>
          </div>
        </div>
        );
      })}

      <button
        type="button"
        onClick={addMessage}
        className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/3 px-4 py-3 text-sm text-navy-400 hover:border-violet-500/40 hover:text-white transition"
      >
        <Plus className="h-4 w-4" />
        Add {allowSenderToggle ? "message" : `${label} message`}
      </button>
    </div>
  );
}
