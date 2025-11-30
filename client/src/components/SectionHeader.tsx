import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  countLabel?: string;
  variant?: 'confirmed' | 'pending' | 'active';
}

export default function SectionHeader({ icon: Icon, title, countLabel, variant = 'confirmed' }: SectionHeaderProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'confirmed':
        return 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700 shadow-md hover:shadow-indigo-500/30';
      case 'pending':
        return 'bg-white dark:bg-gray-800 text-amber-500 dark:text-amber-400 border-amber-200 dark:border-amber-700 shadow-md hover:shadow-amber-500/30';
      case 'active':
        return 'bg-white dark:bg-gray-800 text-emerald-500 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700 shadow-md hover:shadow-emerald-500/30';
      default:
        return 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700 shadow-md';
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b-2 border-gray-900 bg-card px-6">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="w-5 h-5 text-foreground flex-shrink-0" />
        <h2 className="text-xl font-extrabold text-foreground tracking-tight uppercase truncate">{title}</h2>
      </div>
      {countLabel && (
        <div 
          className={`px-4 py-2 rounded-lg border text-center transition-all duration-300 hover:scale-[1.03] flex-shrink-0 ${getVariantStyles()}`}
          data-testid={`badge-${variant}`}
        >
          <div className="text-2xl font-extrabold leading-none">
            {countLabel.split(' ')[0]}
          </div>
          <div className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mt-0.5">
            {countLabel.split(' ').slice(1).join(' ')}
          </div>
        </div>
      )}
    </div>
  );
}
