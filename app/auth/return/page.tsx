"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/components/ui/Loading";
import { createClient } from "@/utils/supabase/client";

export default function AuthReturnPage() {
  const router = useRouter();

  useEffect(() => {
    const returnTo = sessionStorage.getItem("banterbird:auth_return_to") ?? "/";
    const oldAnonId = sessionStorage.getItem("banterbird:anon_user_id");
    sessionStorage.removeItem("banterbird:auth_return_to");
    sessionStorage.removeItem("banterbird:anon_user_id");
    sessionStorage.removeItem("banterbird:oauth_redirect");

    const supabase = createClient();

    const run = async () => {
      // Wait for auth state to confirm the new named session
      await new Promise<void>((resolve) => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event) => {
            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
              subscription.unsubscribe();
              resolve();
            }
          },
        );
        // Fallback timeout
        setTimeout(() => { subscription.unsubscribe(); resolve(); }, 3000);
      });

      const { data: { user } } = await supabase.auth.getUser();
      const newUserId = user?.id;

      if (oldAnonId && newUserId && oldAnonId !== newUserId) {
        // Migrate friend requests AND room participation from anonymous ID
        await fetch("/api/auth/migrate-pending-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldUserId: oldAnonId, newUserId }),
        });

        await fetch("/api/auth/migrate-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldUserId: oldAnonId, newUserId }),
        });
      }

      router.replace(returnTo);
    };

    void run();
  }, [router]);

  return <PageLoader label="Signing you in…" />;
}
