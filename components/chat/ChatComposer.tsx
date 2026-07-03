"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";

type Props = {
  disabled?: boolean;
  onSend: (text: string) => Promise<void>;
  onTypingChange: (typing: boolean) => void;
  onFocus?: () => void;
};

export function ChatComposer({ disabled, onSend, onTypingChange, onFocus }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTypingTimer = () => {
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
  };

  const scheduleTypingStop = useCallback(() => {
    clearTypingTimer();
    typingTimer.current = setTimeout(() => {
      onTypingChange(false);
      typingTimer.current = null;
    }, 1200);
  }, [onTypingChange]);

  useEffect(() => {
    return () => {
      clearTypingTimer();
      onTypingChange(false);
    };
  }, [onTypingChange]);

  const handleChange = (next: string) => {
    setValue(next);
    if (next.trim()) {
      onTypingChange(true);
      scheduleTypingStop();
    } else {
      clearTypingTimer();
      onTypingChange(false);
    }
  };

  const submit = async () => {
    const t = value.trim();
    if (!t || sending || disabled) return;
    setSending(true);
    clearTypingTimer();
    onTypingChange(false);
    try {
      await onSend(t);
      setValue("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="glass-panel rounded-3xl p-2 sm:p-3">
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          disabled={disabled || sending}
          placeholder="Say something nice…"
          enterKeyHint="send"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-navy-200/80 bg-white/80 px-4 py-3 text-[16px] text-navy-950 outline-none ring-navy-900/10 placeholder:text-navy-400 focus:ring-2 dark:border-white/10 dark:bg-navy-950/60 dark:text-navy-50 dark:placeholder:text-navy-500"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            onFocus?.();
            window.setTimeout(() => onFocus?.(), 150);
            window.setTimeout(() => onFocus?.(), 400);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          disabled={!value.trim() || sending || disabled}
          onClick={() => void submit()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-white shadow-md transition enabled:hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-navy-100 dark:text-navy-950 dark:enabled:hover:bg-white"
          aria-label="Send message"
        >
          <Send className="h-5 w-5" />
        </motion.button>
      </div>
    </div>
  );
}
