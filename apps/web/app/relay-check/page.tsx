"use client";

import { useRef, useState } from "react";

// Diagnostic-only page, not linked from anywhere in the app. Visit directly
// at /relay-check. Tests whether THIS device's network can reach the public
// WalletConnect relay that Web3Auth's external-wallet connector depends on
// (wss://relay.walletconnect.com) -- both @web3auth/modal and
// @web3auth/no-modal route through this exact same relay regardless of whose
// project id is used, and Valor already dropped a self-hosted WalletConnect
// connector after this relay proved unreachable on many carrier/ISP DNS
// resolvers. A raw WebSocket probe needs no wallet-connect app logic, no
// project id, and no UI beyond this page, so it isolates "is the relay
// reachable at all" from every other moving part in the real connect flow.
const RELAY_URL = "wss://relay.walletconnect.com";
const GIVE_UP_MS = 90_000;

type Result = { verdict: "reachable" | "unreachable" | "ambiguous"; detail: string; elapsedMs: number };

export default function RelayCheckPage() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const startRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function runTest() {
    setResult(null);
    setRunning(true);
    setElapsed(0);
    startRef.current = Date.now();
    tickRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 100);

    let settled = false;
    const finish = (r: Result) => {
      if (settled) return;
      settled = true;
      if (tickRef.current) clearInterval(tickRef.current);
      setRunning(false);
      setResult(r);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(RELAY_URL);
    } catch (err) {
      finish({ verdict: "unreachable", detail: `WebSocket constructor threw: ${err instanceof Error ? err.message : String(err)}`, elapsedMs: Date.now() - startRef.current });
      return;
    }

    const giveUp = setTimeout(() => {
      finish({
        verdict: "unreachable",
        detail: `No open/error/close event at all after ${GIVE_UP_MS / 1000}s -- this is what a silently dropped connection (DNS blackhole / firewall drop with no RST) looks like.`,
        elapsedMs: Date.now() - startRef.current,
      });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }, GIVE_UP_MS);

    ws.onopen = () => {
      clearTimeout(giveUp);
      finish({ verdict: "reachable", detail: "Connection opened. The relay itself is reachable from this network.", elapsedMs: Date.now() - startRef.current });
      ws.close();
    };
    ws.onerror = () => {
      // onerror alone doesn't say much -- wait for the paired onclose for a reason/code.
    };
    ws.onclose = (ev) => {
      clearTimeout(giveUp);
      // A close WITH a code (even a rejection like 400/401 for missing params)
      // means the network round-trip actually completed -- the relay is
      // reachable, it just didn't like this bare connection. A close with no
      // real code shortly after an error, with no meaningful elapsed time, is
      // ambiguous rather than a confirmed reachability failure.
      const gotServerResponse = ev.code !== 1006 || Date.now() - startRef.current > 3000;
      finish({
        verdict: gotServerResponse ? "reachable" : "ambiguous",
        detail: `Closed: code=${ev.code} reason="${ev.reason || "(none)"}" wasClean=${ev.wasClean}`,
        elapsedMs: Date.now() - startRef.current,
      });
    };
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0806", color: "#e8eef2", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ color: "#f2c14e", fontSize: 20, marginBottom: 8 }}>WalletConnect relay check</h1>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(232,238,242,0.7)", marginBottom: 20 }}>
          Tests whether this device&apos;s network can reach <code>{RELAY_URL}</code> -- the server Web3Auth&apos;s wallet-connect
          fallback depends on. Can take up to 90 seconds to give a definitive answer if the connection is silently dropped rather than
          actively refused, so let it run.
        </p>
        <button
          onClick={runTest}
          disabled={running}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            border: "1px solid rgba(242,193,78,0.4)",
            background: running ? "transparent" : "#f2c14e",
            color: running ? "#f2c14e" : "#1a140f",
            fontWeight: 800,
            fontSize: 13,
            cursor: running ? "default" : "pointer",
          }}
        >
          {running ? `Testing… ${(elapsed / 1000).toFixed(1)}s` : "Run test"}
        </button>

        {result && (
          <div
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${result.verdict === "reachable" ? "rgba(120,200,120,0.4)" : result.verdict === "unreachable" ? "rgba(242,138,92,0.4)" : "rgba(242,193,78,0.4)"}`,
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, color: result.verdict === "reachable" ? "#8fd98f" : result.verdict === "unreachable" ? "#f28a5c" : "#f2c14e" }}>
              {result.verdict.toUpperCase()} ({(result.elapsedMs / 1000).toFixed(1)}s)
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(232,238,242,0.75)" }}>{result.detail}</div>
          </div>
        )}
      </div>
    </div>
  );
}
