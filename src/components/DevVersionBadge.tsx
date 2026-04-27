import { useEffect, useState } from "react";
import localVersionData from "../../public/version.json";

const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/Pranavshah0907/Bravoro/main/public/version.json";

export function DevVersionBadge() {
  const localVersion = String(localVersionData.version);
  const [liveVersion, setLiveVersion] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch(`${GITHUB_RAW_URL}?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLiveVersion(d.version != null ? String(d.version) : null))
      .catch(() => setLiveVersion(null))
      .finally(() => setFetching(false));
  }, []);

  const localMinor = parseInt(localVersion.split(".")[1] ?? "0");
  const liveMinor  = liveVersion !== null ? parseInt(liveVersion.split(".")[1] ?? "0") : null;
  const diff = liveMinor !== null ? localMinor - liveMinor : null;
  const status =
    diff === null ? "unknown" : diff === 0 ? "synced" : diff > 0 ? "ahead" : "behind";

  const colors = {
    synced:  { bg: "hsl(var(--accent) / 0.10)",  border: "hsl(var(--accent) / 0.32)",  dot: "hsl(var(--accent))" },
    ahead:   { bg: "rgba(234,179,8,0.10)",       border: "rgba(234,179,8,0.32)",       dot: "#eab308" },
    behind:  { bg: "rgba(239,68,68,0.10)",       border: "rgba(239,68,68,0.32)",       dot: "#ef4444" },
    unknown: { bg: "hsl(var(--muted) / 0.6)",    border: "hsl(var(--border))",         dot: "hsl(var(--muted-foreground))" },
  }[status];

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 11,
        fontFamily: "monospace",
        color: "hsl(var(--muted-foreground))",
        display: "flex",
        alignItems: "center",
        gap: 8,
        backdropFilter: "blur(8px)",
        userSelect: "none",
      }}
    >
      <span style={{ color: colors.dot, fontSize: 8 }}>●</span>
      <span>
        <span style={{ color: "hsl(var(--foreground))", fontWeight: 600 }}>Local v{localVersion}</span>
        <span style={{ color: "hsl(var(--muted-foreground) / 0.6)", margin: "0 5px" }}>|</span>
        <span>
          Live{" "}
          {fetching
            ? "…"
            : liveVersion === null
            ? "?"
            : `v${liveVersion}`}
        </span>
        {diff !== null && diff !== 0 && (
          <span style={{ marginLeft: 5, color: colors.dot }}>
            {diff > 0 ? `↑${diff} ahead` : `↓${Math.abs(diff)} behind`}
          </span>
        )}
      </span>
    </div>
  );
}
