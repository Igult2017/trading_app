import { useState, useEffect } from "react";

const MESSAGES = [
  "Crunching your trade data…",
  "Building your equity curve…",
  "Calculating win rate…",
  "Analysing risk-reward ratios…",
  "Scanning strategy performance…",
  "Mapping your trade sessions…",
  "Computing drawdown metrics…",
  "Evaluating your edge…",
  "Reviewing execution quality…",
  "Preparing your journal…",
];

/**
 * Gate a loading indicator behind a delay so fast/cached data
 * never triggers the spinner at all (avoids flash on preloaded content).
 */
export function useDelayedLoading(isLoading: boolean, delay = 150): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isLoading) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [isLoading, delay]);
  return show;
}

interface TradingLoaderProps {
  message?: string;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function TradingLoader({
  message,
  fullScreen = false,
  size = "md",
}: TradingLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const ticker = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const remaining = 90 - prev;
        return prev + remaining * 0.045 + 0.25;
      });
    }, 80);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    if (message) return;
    const rotator = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2400);
    return () => clearInterval(rotator);
  }, [message]);

  const displayMessage = message ?? MESSAGES[msgIndex];

  const dim = size === "sm" ? 56 : size === "lg" ? 112 : 80;
  const r = (dim / 2) * 0.9;
  const cx = dim / 2;
  const cy = dim / 2;
  const circ = 2 * Math.PI * r;
  const innerDim = dim * 0.42;
  const innerBorder = size === "sm" ? 1.5 : 2;
  const barW = size === "sm" ? 140 : size === "lg" ? 260 : 200;

  const wrapper: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: size === "sm" ? 12 : 20,
    padding: fullScreen ? 0 : size === "sm" ? "24px 16px" : "60px 24px",
    ...(fullScreen
      ? {
          position: "fixed",
          inset: 0,
          background: "#07090f",
          zIndex: 9999,
        }
      : {}),
  };

  return (
    <div style={wrapper}>
      {fullScreen && (
        <div
          style={{
            marginBottom: 4,
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: 16,
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ color: "#ffffff" }}>FSD </span>
          <span style={{ color: "#3b82f6" }}>Journal</span>
        </div>
      )}

      <div style={{ position: "relative", width: dim, height: dim }}>
        <svg
          width={dim}
          height={dim}
          style={{ transform: "rotate(-90deg)", display: "block" }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="rgba(59,130,246,0.12)"
            strokeWidth={size === "sm" ? 3 : 4}
            fill="transparent"
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="#3b82f6"
            strokeWidth={size === "sm" ? 3 : 4}
            strokeDasharray={circ}
            strokeDashoffset={circ - (circ * Math.min(progress, 100)) / 100}
            strokeLinecap="round"
            fill="transparent"
            style={{
              transition: "stroke-dashoffset 0.3s ease-out",
              filter: "drop-shadow(0 0 6px rgba(59,130,246,0.55))",
            }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: innerDim,
              height: innerDim,
              border: `${innerBorder}px solid rgba(59,130,246,0.15)`,
              borderTopColor: "#3b82f6",
              borderRadius: "50%",
              animation: "fsd-spin 0.9s linear infinite",
            }}
          />
        </div>
      </div>

      <div
        style={{
          width: barW,
          height: size === "sm" ? 2 : 3,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 99,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(progress, 100)}%`,
            background: "linear-gradient(to right, #1d4ed8, #60a5fa)",
            borderRadius: 99,
            transition: "width 0.5s ease-out",
          }}
        />
      </div>

      {size !== "sm" && (
        <p
          style={{
            margin: 0,
            fontFamily: "'DM Mono', 'Fira Mono', monospace",
            fontSize: size === "lg" ? 13 : 11,
            fontWeight: 500,
            color: "rgba(148,163,184,0.7)",
            letterSpacing: "0.04em",
            textAlign: "center",
            transition: "opacity 0.4s",
          }}
        >
          {displayMessage}
        </p>
      )}

      <style>{`
        @keyframes fsd-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
