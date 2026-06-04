import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Item { quote: string; name: string; }

interface Props {
  items: Item[];
  direction?: "left" | "right";
  speed?: "fast" | "normal" | "slow";
  pauseOnHover?: boolean;
  className?: string;
  darkMode?: boolean;
}

export function InfiniteMovingCards({ items, direction = "left", speed = "normal", pauseOnHover = true, className, darkMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !scrollerRef.current) return;
    const list = scrollerRef.current;
    Array.from(list.children).forEach((child) => list.appendChild(child.cloneNode(true)));
    containerRef.current.style.setProperty("--animation-direction", direction === "left" ? "forwards" : "reverse");
    containerRef.current.style.setProperty("--animation-duration", speed === "fast" ? "20s" : speed === "slow" ? "80s" : "40s");
    setReady(true);
  }, [direction, speed]);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]", className)}
    >
      <ul
        ref={scrollerRef}
        className={cn(
          "flex min-w-full shrink-0 gap-4 py-2 w-max flex-nowrap",
          ready && "animate-scroll",
          pauseOnHover && "hover:[animation-play-state:paused]"
        )}
      >
        {items.map((item, idx) => (
          <li
            key={idx}
            className={cn(
              "w-[320px] shrink-0 rounded-2xl border px-7 py-5",
              darkMode
                ? "bg-slate-800/60 border-slate-700"
                : "bg-white border-slate-200 shadow-sm"
            )}
          >
            <p className={cn("text-sm leading-relaxed italic mb-4", darkMode ? "text-slate-300" : "text-slate-600")}>
              &ldquo;{item.quote}&rdquo;
            </p>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                {item.name[0]}
              </div>
              <span className={cn("text-sm font-semibold", darkMode ? "text-white" : "text-slate-800")}>{item.name}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
