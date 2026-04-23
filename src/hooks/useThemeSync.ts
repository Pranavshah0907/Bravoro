import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";

type ThemePreference = "light" | "dark" | "system";

const VALID_THEMES: ThemePreference[] = ["light", "dark", "system"];

function isValidTheme(value: string | undefined): value is ThemePreference {
  return value !== undefined && VALID_THEMES.includes(value as ThemePreference);
}

/**
 * Bidirectional sync between next-themes and profiles.theme_preference.
 *
 * - On login: pulls theme from Supabase, applies if it differs from local state.
 * - On theme change: pushes to Supabase (fire-and-forget, doesn't block UI).
 * - Logged out: silently no-ops.
 */
export function useThemeSync() {
  const { theme, setTheme } = useTheme();
  const hasPulledFromRemote = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function pullTheme() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("theme_preference")
        .eq("id", user.id)
        .single();

      if (cancelled || error || !data) return;

      const remote = data.theme_preference;
      if (isValidTheme(remote) && remote !== theme) {
        setTheme(remote);
      }
      hasPulledFromRemote.current = true;
    }

    pullTheme();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        hasPulledFromRemote.current = false;
        pullTheme();
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isValidTheme(theme)) return;
    if (!hasPulledFromRemote.current) return;

    let cancelled = false;
    async function pushTheme() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      await supabase
        .from("profiles")
        .update({ theme_preference: theme as ThemePreference })
        .eq("id", user.id);
    }

    pushTheme();

    return () => {
      cancelled = true;
    };
  }, [theme]);
}
