import { initials } from "../lib/format";

interface AvatarProps {
  name: string;
}

/** Initials tile — the 36px avatar used by every person/account row. */
export function Avatar({ name }: AvatarProps) {
  return (
    <div className="w-9 h-9 flex items-center justify-center bg-surface-container-highest text-on-surface font-bold rounded shrink-0 text-[11px]">
      {initials(name)}
    </div>
  );
}
