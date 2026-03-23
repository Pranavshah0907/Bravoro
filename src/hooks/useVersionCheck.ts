import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export function useVersionCheck() {
  const initialVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const fetchVersion = async (): Promise<string | null> => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return data.version ?? null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    // Capture the version this session loaded with
    fetchVersion().then((v) => {
      initialVersion.current = v;
    });

    const interval = setInterval(async () => {
      const latest = await fetchVersion();
      if (latest && initialVersion.current && latest !== initialVersion.current) {
        setUpdateAvailable(true);
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return updateAvailable;
}
