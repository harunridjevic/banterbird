"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, LogOut } from "lucide-react";
import { InlineSpinner } from "@/components/ui/Loading";
import { FormField } from "./FormField";
import type { Profile } from "@/lib/account/types";
import { useAccount } from "@/lib/account/context";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

export function ProfileEditor({
  profile,
  supabase,
  onClose,
}: {
  profile: Profile;
  supabase: SupabaseClient;
  onClose: () => void;
}) {
  const { refresh } = useAccount();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(profile.username ?? "");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > AVATAR_MAX_BYTES) {
      setError("Avatar must be under 2 MB.");
      return;
    }
    setError(null);
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadAvatar = async (userId: string): Promise<string | null> => {
    if (!avatarFile) return avatarPreview;
    const ext = avatarFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
    const path = `avatars/${userId}.${safeExt}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
    if (upErr) throw new Error(`Avatar upload failed: ${upErr.message}`);
    // Bust cache by appending a timestamp
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();

    if (trimmedUsername && trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (trimmedUsername && !USERNAME_RE.test(trimmedUsername)) {
      setError("Username can only contain letters, numbers and underscores.");
      return;
    }
    if (newPassword.trim() && newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const avatarUrl = await uploadAvatar(user.id);

      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert(
          { id: user.id, username: trimmedUsername || null, avatar_url: avatarUrl },
          { onConflict: "id" },
        );

      if (profileErr) {
        throw new Error(
          profileErr.message.toLowerCase().includes("unique")
            ? "That username is already taken."
            : profileErr.message,
        );
      }

      if (email.trim()) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: email.trim() });
        if (emailErr) throw new Error(emailErr.message);
      }

      if (newPassword.trim()) {
        const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
        if (pwErr) throw new Error(pwErr.message);
      }

      await refresh();
      setSuccess("Profile saved.");
      setEmail("");
      setNewPassword("");
      setAvatarFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    await refresh();
    onClose();
    setSigningOut(false);
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleSave} className="space-y-4">
        {/* Avatar picker */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-navy-200/70 bg-navy-100 transition hover:border-navy-400 dark:border-white/10 dark:bg-navy-800 dark:hover:border-white/30"
            aria-label="Change profile picture"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Your avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-navy-400 dark:text-navy-500">
                {(username || "?")[0]?.toUpperCase()}
              </span>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-navy-950/50 opacity-0 transition group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy-950 dark:text-navy-50">
              {profile.username ?? "No username set"}
            </p>
            <p className="text-xs text-navy-500 dark:text-navy-400">
              {avatarFile ? `New photo ready to save` : "Tap photo to change"}
            </p>
          </div>
        </div>

        {/* Username */}
        <FormField
          id="edit-username"
          label="Username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="coolbird42"
        />

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
          <span className="text-[11px] text-navy-400 dark:text-navy-500">Security</span>
          <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
        </div>

        {/* New email */}
        <FormField
          id="edit-email"
          label="Change email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Leave blank to keep current"
        />

        {/* New password */}
        <FormField
          id="edit-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Leave blank to keep current"
        />

        {error && (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 py-3 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 dark:bg-navy-100 dark:text-navy-950 dark:hover:bg-white"
        >
          {saving ? <InlineSpinner /> : "Save changes"}
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-navy-200/70 py-2.5 text-sm font-semibold text-navy-600 transition hover:bg-navy-100 disabled:opacity-60 dark:border-white/10 dark:text-navy-400 dark:hover:bg-navy-800"
        >
          {signingOut ? <InlineSpinner className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
          Sign out
        </button>
      </form>
    </div>
  );
}
