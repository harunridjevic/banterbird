import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "chat-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Prefix used to mark image messages in the content field */
export const IMG_PREFIX = "[img]";

/** Returns true if a message content string is an image URL */
export function isImageMessage(content: string): boolean {
  return content.startsWith(IMG_PREFIX);
}

/** Extract the URL from an image message content string */
export function extractImageUrl(content: string): string {
  return content.slice(IMG_PREFIX.length);
}

/** Encode a URL as an image message content string */
export function encodeImageMessage(url: string): string {
  return `${IMG_PREFIX}${url}`;
}

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Upload an image file to Supabase Storage and return the public URL.
 * Uses a per-user timestamped path to avoid collisions.
 */
export async function uploadChatImage(
  file: File,
  supabase: SupabaseClient,
  userId: string,
): Promise<UploadResult> {
  if (!ALLOWED.includes(file.type)) {
    return { ok: false, error: "Only JPEG, PNG, WebP and GIF images are supported." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Image must be under 5 MB." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeExt = ALLOWED.some((m) => m.endsWith(ext)) ? ext : "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (upErr) return { ok: false, error: upErr.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
