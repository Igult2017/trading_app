interface StarsProps {
  rating: number;
  size?: string;
}

/** Five stars, the filled count rounded from `rating`; the remainder sits at 30% opacity. */
export function Stars({ rating, size = "13px" }: StarsProps) {
  const full = Math.round(rating);
  return (
    <span className="text-primary leading-none" style={{ fontSize: size }}>
      {"★".repeat(full)}
      <span className="opacity-30">{"★".repeat(5 - full)}</span>
    </span>
  );
}
