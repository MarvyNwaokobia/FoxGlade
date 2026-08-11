"use client";

import { useState } from "react";

/**
 * A single reusable "Confirm this on-chain action" dialog, styled like the
 * rest of the game rather than a bare browser/wallet prompt — the point Marvy
 * raised: everything up to and including this confirmation stays in-app.
 * Magic itself may still show its own brief in-page signature prompt after
 * Confirm is tapped (a security step on Magic's side, not something to try to
 * suppress) — but there is no redirect out of the page either way.
 */
interface Props {
  title: string;
  lines: string[];
  confirmLabel: string;
  onConfirm: () => Promise<{ txHash?: string } | void>;
  onClose: () => void;
}

export function OnChainConfirm({ title, lines, confirmLabel, onConfirm, onClose }: Props) {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const run = async () => {
    setStatus("busy");
    setError(null);
    try {
      const result = await onConfirm();
      setTxHash(result?.txHash ?? null);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  return (
    <div style={styles.root} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>{title}</div>
        {status === "done" ? (
          <>
            <div style={styles.success}>Done{txHash ? " — confirmed on-chain" : ""}.</div>
            {txHash && (
              <a
                href={`https://snowtrace.io/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={styles.link}
              >
                View transaction ↗
              </a>
            )}
            <button style={styles.confirm} onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            {lines.map((l, i) => (
              <div key={i} style={styles.line}>
                {l}
              </div>
            ))}
            {status === "error" && <div style={styles.error}>{error}</div>}
            <div style={styles.row}>
              <button style={styles.cancel} onClick={onClose} disabled={status === "busy"}>
                Cancel
              </button>
              <button style={styles.confirm} onClick={run} disabled={status === "busy"}>
                {status === "busy" ? "Confirming…" : confirmLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const GOLD = "#f2c14e";
const INK = "#e8eef2";

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.55)",
    fontFamily: "system-ui, sans-serif",
  },
  panel: {
    width: "min(360px, 90vw)",
    background: "linear-gradient(180deg, rgba(26,22,17,0.98), rgba(16,14,11,0.98))",
    border: "1px solid rgba(242,193,78,0.4)",
    borderRadius: 14,
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    padding: 20,
    color: INK,
  },
  title: { color: GOLD, fontWeight: 800, fontSize: 16, letterSpacing: 0.5, marginBottom: 12 },
  line: { fontSize: 13, color: "rgba(232,238,242,0.8)", marginBottom: 6 },
  error: { fontSize: 12.5, color: "#f2846e", marginTop: 8 },
  success: { fontSize: 13.5, color: "#aef2cb", marginBottom: 10 },
  link: { fontSize: 12.5, color: GOLD, display: "block", marginBottom: 16 },
  row: { display: "flex", gap: 10, marginTop: 16 },
  cancel: {
    flex: 1,
    color: INK,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  confirm: {
    flex: 1,
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
};
