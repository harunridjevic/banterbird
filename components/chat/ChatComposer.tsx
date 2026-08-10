"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Send, X } from "lucide-react";
import { InlineSpinner } from "@/components/ui/Loading";
import { useAccount } from "@/lib/account/context";
import { AccountNudge } from "@/components/account/AccountNudge";

type Props = {
  disabled?: boolean;
  onSend: (text: string) => Promise<void>;
  onSendImage?: (file: File) => Promise<void>;
  onTypingChange: (typing: boolean) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Called instead of opening the file picker when the daily image limit is hit */
  onImageLimitHit?: () => void;
  /** Remaining images today — null = unlimited (pro), 0 = limit hit */
  imagesRemaining?: number | null;
};

export function ChatComposer({ disabled, onSend, onSendImage, onTypingChange, onFocus, onBlur, onImageLimitHit, imagesRemaining }: Props) {
  const { state } = useAccount();
  const isAnonymous = state.status === "anonymous" || state.status === "loading";
  const [showImageNudge, setShowImageNudge] = useState(false);
  const imageButtonRef = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const clearImage = () => {
    setImagePreview(null);
    setImageFile(null);
    setImageError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be under 5 MB.");
      return;
    }
    setImageError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (disabled || sending) return;

    // Send image if one is staged
    if (imageFile && onSendImage) {
      setSending(true);
      clearTypingTimer();
      onTypingChange(false);
      try {
        await onSendImage(imageFile);
        clearImage();
      } finally {
        setSending(false);
      }
      return;
    }

    const t = value.trim();
    if (!t) return;
    setValue("");
    setSending(true);
    clearTypingTimer();
    onTypingChange(false);
    await onSend(t).finally(() => setSending(false));
  };

  const canSend = !disabled && !sending && (imageFile != null || value.trim().length > 0);

  return (
    <div className="glass-panel rounded-3xl p-2 sm:p-3">
      {/* Image preview strip */}
      {imagePreview && (
        <div className="mb-2 flex items-start gap-2 px-1">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Attachment preview"
              className="h-16 w-16 rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy-900 text-white dark:bg-white dark:text-navy-950"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {imageError && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{imageError}</p>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Image attach button */}
        {onSendImage && (
          <div className="relative">
            <button
              type="button"
              ref={imageButtonRef}
              disabled={disabled || sending}
              onClick={() => {
                if (isAnonymous) { setShowImageNudge(true); return; }
                if (imagesRemaining === 0) { onImageLimitHit?.(); return; }
                fileRef.current?.click();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-navy-200/80 bg-white/70 text-navy-600 transition hover:bg-white disabled:opacity-40 dark:border-white/10 dark:bg-navy-900/50 dark:text-navy-400 dark:hover:bg-navy-800"
              aria-label="Attach image"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            {/* Daily image limit badge */}
            {!isAnonymous && imagesRemaining !== null && imagesRemaining !== undefined && (
              <span
                className={`pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold leading-none ${
                  imagesRemaining === 0
                    ? "bg-rose-500 text-white"
                    : "bg-amber-400 text-navy-950"
                }`}
                aria-label={`${imagesRemaining} image${imagesRemaining === 1 ? "" : "s"} remaining today`}
              >
                {imagesRemaining}
              </span>
            )}
            <AccountNudge
              visible={showImageNudge}
              onDismiss={() => setShowImageNudge(false)}
              message="Create a free account to send images."
              triggerRef={imageButtonRef}
              preferBelow={false}
            />
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          disabled={disabled || !!imageFile}
          placeholder={imageFile ? "Image ready to send…" : "Say something nice…"}
          enterKeyHint="send"
          className="max-h-32 min-h-[44px] flex-1 resize-none overflow-y-auto rounded-2xl border border-navy-200/80 bg-white/80 px-4 py-3 text-[16px] text-navy-950 outline-none ring-navy-900/10 placeholder:text-navy-400 focus:ring-2 disabled:opacity-60 dark:border-white/10 dark:bg-navy-950/60 dark:text-navy-50 dark:placeholder:text-navy-500"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => onFocus?.()}
          onBlur={() => onBlur?.()}
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
          disabled={!canSend}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => void submit()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-white shadow-md transition enabled:hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-navy-100 dark:text-navy-950 dark:enabled:hover:bg-white"
          aria-label="Send message"
        >
          {sending ? <InlineSpinner className="h-4 w-4" /> : <Send className="h-5 w-5" />}
        </motion.button>
      </div>
    </div>
  );
}
