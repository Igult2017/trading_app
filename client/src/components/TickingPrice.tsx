import { useEffect, useRef, useState } from "react";

interface Props {
  price: number | null;
  prevPrice: number | null;
  direction: "up" | "down" | "flat";
  decimals?: number;
  fontSize?: number;
  fontWeight?: number;
  showPrefix?: boolean;   // show $ prefix
  animDuration?: number;  // ms to count from old to new (default 400)
}

export default function TickingPrice({
  price,
  prevPrice,
  direction,
  decimals,
  fontSize = 13,
  fontWeight = 700,
  showPrefix = true,
  animDuration = 400,
}: Props) {
  const [displayed, setDisplayed] = useState<number | null>(price);
  const [flash, setFlash]         = useState<"up" | "down" | null>(null);
  const rafRef  = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const fromRef  = useRef<number>(0);

  // Auto-detect decimal places based on price magnitude if not specified
  function getDecimals(p: number): number {
    if (decimals !== undefined) return decimals;
    if (p >= 1000) return 2;
    if (p >= 1)    return 4;
    return 6;
  }

  function formatPrice(p: number): string {
    const d = getDecimals(p);
    const str = p.toLocaleString("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
    return showPrefix ? `$${str}` : str;
  }

  // Animate counting from prevPrice → price
  useEffect(() => {
    if (price === null) return;

    const from = prevPrice ?? price;
    const to   = price;

    if (from === to) return;

    // Trigger flash
    setFlash(to > from ? "up" : "down");
    setTimeout(() => setFlash(null), 600);

    // Cancel any running animation
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    fromRef.current  = from;
    startRef.current = performance.now();

    function tick(now: number) {
      const elapsed  = now - startRef.current;
      const progress = Math.min(elapsed / animDuration, 1);
      // Ease out cubic
      const eased    = 1 - Math.pow(1 - progress, 3);
      const current  = fromRef.current + (to - fromRef.current) * eased;
      setDisplayed(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [price]);

  // Seed initial value immediately
  useEffect(() => {
    if (price !== null && displayed === null) setDisplayed(price);
  }, [price]);

  const color =
    flash === "up"   ? "#22d3a5" :
    flash === "down" ? "#f4617f" :
    direction === "up"   ? "#22d3a5" :
    direction === "down" ? "#f4617f" :
    "#c8d8e8";

  if (displayed === null) {
    return (
      <span style={{ fontSize, fontWeight, color: "#2d4a63", letterSpacing: "0.02em" }}>
        —
      </span>
    );
  }

  return (
    <span style={{
      fontSize,
      fontWeight,
      color,
      letterSpacing: "0.02em",
      transition: flash ? "color 0.15s" : undefined,
      fontVariantNumeric: "tabular-nums",
    }}>
      {formatPrice(displayed)}
    </span>
  );
}
