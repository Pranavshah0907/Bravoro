import { useEffect, useState } from "react";
import localVersionData from "../../public/version.json";

const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/Pranavshah0907/Bravoro/main/public/version.json";

export function DevVersionBadge() {
  const localVersion = localVersionData.version;
  const [liveVersion, setLiveVersion] = useState<number | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch(`${GITHUB_RAW_URL}?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLiveVersion(d.version ?? null))
      .catch(() => setLiveVersion(null))
      .finally(() => setFetching(false));
  }, []);

  const diff = liveVersion !== null ? localVersion - liveVersion : null;
  const status =
    diff === null ? "unknown" : diff === 0 ? "synced" : diff > 0 ? "ahead" : "behind";

  const colors = {
    synced:  { bg: "rgba(0,157,165,0.15)", border: "rgba(0,157,165,0.4)", dot: "#00d4de" },
    ahead:   { bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.4)",  dot: "#eab308" },
    behind:  { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.4)",  dot: "#ef4444" },
    unknown: { bg: "rgba(100,100,100,0.12)", border: "rgba(100,100,100,0.3)", dot: "#666" },
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
        color: "#ccc",
        display: "flex",
        alignItems: "center",
        gap: 8,
        backdropFilter: "blur(8px)",
        userSelect: "none",
      }}
    >
      <span style={{ color: colors.dot, fontSize: 8 }}>●</span>
      <span>
        <span style={{ color: "#fff", fontWeight: 600 }}>Local v{localVersion}</span>
        <span style={{ color: "#555", margin: "0 5px" }}>|</span>
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
