"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, Lock, LogOut, Mail, X } from "lucide-react";
import { InlineSpinner } from "@/components/ui/Loading";
import { FormField } from "./FormField";
import type { Profile } from "@/lib/account/types";
import { useAccount } from "@/lib/account/context";
import { UsernameField } from "./UsernameField";
import { useUsernameCheck } from "@/lib/hooks/use-username-check";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

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
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const { status: usernameStatus } = useUsernameCheck(username, profile.username);

  // null = still loading, true/false = resolved
  // Starting as null prevents the email/password fields flashing for Google users
  const [isGoogleUser, setIsGoogleUser] = useState<boolean | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentEmail(user.email ?? null);
      setUserId(user.id);
      const identities = user.identities ?? [];
      setIsGoogleUser(identities.some((i) => i.provider === "google"));
    })();
  }, [supabase]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > AVATAR_MAX_BYTES) { setError("Avatar must be under 2 MB."); return; }
    setError(null);
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadAvatar = async (userId: string): Promise<string | null> => {
    // Explicitly cleared — set to null
    if (!avatarPreview && !avatarFile) return null;
    if (!avatarFile) return avatarPreview;
    const ext = avatarFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
    const path = `avatars/${userId}.${safeExt}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
    if (upErr) throw new Error(`Avatar upload failed: ${upErr.message}`);
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedEmail = newEmail.trim();
    const trimmedPassword = newPassword.trim();

    // Only validate username if it's being set (not empty)
    if (trimmedUsername && trimmedUsername.length < 3) { setError("Username must be at least 3 characters."); return; }
    if (trimmedUsername && usernameStatus === "taken") { setError("That username is already taken."); return; }
    if (trimmedUsername && usernameStatus === "checking") { setError("Please wait while we check username availability."); return; }
    if (trimmedPassword && trimmedPassword.length < 8) { setError("New password must be at least 8 characters."); return; }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const avatarUrl = await uploadAvatar(user.id);

      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert({ id: user.id, username: trimmedUsername || null, avatar_url: avatarUrl }, { onConflict: "id" });

      if (profileErr) {
        throw new Error(
          profileErr.message.toLowerCase().includes("unique")
            ? "That username is already taken."
            : profileErr.message,
        );
      }

      // Keep auth metadata in sync so username appears in Supabase dashboard
      if (trimmedUsername) {
        void fetch("/api/auth/create-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmedUsername, metadataOnly: true }),
        });
      }

      // Email change — Supabase sends a confirmation email to the new address automatically
      // (it uses whatever SMTP is configured, i.e. Resend via custom SMTP)
      if (trimmedEmail && !isGoogleUser) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: trimmedEmail });
        if (emailErr) throw new Error(emailErr.message);
      }

      // Password change — Supabase does the update; we also send a notification
      if (trimmedPassword && !isGoogleUser) {
        const { error: pwErr } = await supabase.auth.updateUser({ password: trimmedPassword });
        if (pwErr) throw new Error(pwErr.message);

        // Fire-and-forget: notify user via email that password changed
        if (user.email) {
          void fetch("/api/auth/notify-password-changed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email }),
          });
        }
      }

      await refresh();
      setSuccess(
        trimmedEmail && !isGoogleUser
          ? "Saved. Check your new email address to confirm the change."
          : "Profile saved.",
      );
      setNewEmail("");
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

  const handleDeleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeletingAccount(true);
    setError(null);
    const res = await fetch("/api/auth/delete-account", { method: "POST" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Failed to delete account.");
      setDeletingAccount(false);
      setConfirmDelete(false);
      return;
    }
    await refresh();
    onClose();
    setDeletingAccount(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        <form id="profile-form" onSubmit={handleSave} className="space-y-4">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative h-16 w-16 overflow-hidden rounded-2xl border-2 border-navy-200/70 bg-navy-100 transition hover:border-navy-400 dark:border-white/10 dark:bg-navy-800 dark:hover:border-white/30"
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
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy-950 dark:text-navy-50">{profile.username ?? "No username set"}</p>
            <p className="text-xs text-navy-500 dark:text-navy-400">
              {avatarFile ? "New photo ready to save" : avatarPreview ? "Tap to change" : "Tap to add a photo"}
            </p>
            {avatarPreview && (
              <button
                type="button"
                onClick={() => {
                  setAvatarPreview(null);
                  setAvatarFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="mt-1 flex items-center gap-1 text-xs text-navy-400 transition hover:text-rose-500 dark:text-navy-500 dark:hover:text-rose-400"
                aria-label="Remove profile picture"
              >
                <X className="h-3 w-3" />
                Remove photo
              </button>
            )}
          </div>
        </div>

        {/* Username */}
        <UsernameField
          id="edit-username"
          value={username}
          onChange={setUsername}
          currentUsername={profile.username}
          currentUserId={userId}
        />

        {/* Security section — show spinner while auth provider is being determined */}
        {isGoogleUser === null ? (
          <div className="flex items-center gap-3 py-4">
            <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
            <InlineSpinner className="h-4 w-4" />
            <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
              <span className="text-[11px] text-navy-400 dark:text-navy-500">Security</span>
              <div className="h-px flex-1 bg-navy-200/70 dark:bg-white/10" />
            </div>

            {/* Email */}
            {isGoogleUser ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-navy-700 dark:text-navy-300">Email</label>
                <div className="flex items-center gap-2 rounded-xl border border-navy-200/60 bg-navy-100/60 px-3 py-2.5 dark:border-white/10 dark:bg-navy-800/50">
                  <Mail className="h-4 w-4 shrink-0 text-navy-400 dark:text-navy-500" />
                  <span className="flex-1 truncate text-sm text-navy-700 dark:text-navy-300">{currentEmail ?? "—"}</span>
                  <Lock className="h-3.5 w-3.5 shrink-0 text-navy-400 dark:text-navy-500" />
                </div>
                <p className="text-[11px] text-navy-400 dark:text-navy-500">Managed by Google — change it in your Google account.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="edit-email" className="block text-xs font-semibold text-navy-700 dark:text-navy-300">
                  Change email
                </label>
                {currentEmail && (
                  <p className="text-[11px] text-navy-500 dark:text-navy-400">
                    Current: <span className="font-medium text-navy-700 dark:text-navy-300">{currentEmail}</span>
                  </p>
                )}
                <input
                  id="edit-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Enter new email address"
                  className="w-full rounded-xl border border-navy-200/80 bg-white/80 px-3 py-2.5 text-sm text-navy-950 placeholder:text-navy-400 transition focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-400/20 dark:border-white/10 dark:bg-navy-900/60 dark:text-navy-50 dark:placeholder:text-navy-500"
                />
                <p className="text-[11px] text-navy-400 dark:text-navy-500">A confirmation email will be sent to the new address.</p>
              </div>
            )}

            {/* Password — hidden for Google users */}
            {!isGoogleUser && (
              <div className="space-y-1.5">
                <FormField id="edit-password" label="New password" type="password" autoComplete="new-password"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current" />
              </div>
            )}
          </>
        )}

        {error && (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">{error}</p>
        )}
        {success && (
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">{success}</p>
        )}

        </form>
      </div>

      {/* Sticky bottom action bar */}
      <div className="shrink-0 space-y-2 border-t border-navy-200/60 px-0 pt-4 bg-white/[0.97] dark:bg-navy-950/[0.97] dark:border-white/10"
           style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <button
          type="submit"
          form="profile-form"
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

        {/* Close account — under sign out */}
        {confirmDelete ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">Are you sure? This is permanent.</p>
            <p className="text-xs text-rose-600/80 dark:text-rose-400/70">
              Your account, profile, friends and all messages will be deleted. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={deletingAccount}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deletingAccount ? <InlineSpinner className="h-4 w-4" /> : "Yes, delete my account"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-xl border border-navy-200/70 px-4 py-2.5 text-sm font-semibold text-navy-600 transition hover:bg-navy-100 dark:border-white/10 dark:text-navy-400 dark:hover:bg-navy-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full text-center text-xs text-navy-400 underline-offset-2 transition hover:text-rose-500 hover:underline dark:text-navy-500 dark:hover:text-rose-400"
          >
            Close account
          </button>
        )}
      </div>
    </div>
  );
}
