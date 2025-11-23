import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  countLabel?: string;
}

export default function SectionHeader({ icon: Icon, title, countLabel }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b-2 border-gray-900 bg-card px-6">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-foreground" />
        <h2 className="text-xl font-extrabold text-foreground tracking-tight uppercase">{title}</h2>
      </div>
      {countLabel && (
        <span className="px-3 py-1 text-xs font-bold text-foreground bg-amber-200 dark:bg-amber-800 uppercase tracking-widest border border-foreground">
          {countLabel}
        </span>
      )}
    </div>
  );
}
