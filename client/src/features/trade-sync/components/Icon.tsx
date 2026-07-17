import type { CSSProperties } from "react";

interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
  style?: CSSProperties;
}

/** A Material Icons ligature glyph. `name` is the ligature text, e.g. "dashboard". */
export function Icon({ name, className = "", filled = false, style }: IconProps) {
  return (
    <span
      className={`material-icons ${className}`}
      style={{ fontVariationSettings: filled ? "'FILL' 1" : undefined, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
