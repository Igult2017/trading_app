import { Card } from '@/components/ui/card';

interface StatusMetricsProps {
  confirmed: number;
  pending: number;
  active: number;
}

export default function StatusMetrics({ confirmed, pending, active }: StatusMetricsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
      <Card className="p-3 bg-card rounded-lg shadow-lg transition duration-300 hover:shadow-indigo-600/40 dark:hover:shadow-indigo-500/30 transform hover:scale-[1.03] w-28 sm:w-36 text-center border-0" data-testid="card-confirmed-count">
        <div className="text-4xl sm:text-5xl font-extrabold text-indigo-600 dark:text-indigo-400 leading-none transition duration-500">
          {confirmed}
        </div>
        <div className="mt-1 text-[10px] sm:text-xs font-medium tracking-widest uppercase text-muted-foreground">
          CONFIRMED
        </div>
      </Card>

      <Card className="p-3 bg-card rounded-lg shadow-lg transition duration-300 hover:shadow-amber-500/40 dark:hover:shadow-amber-400/30 transform hover:scale-[1.03] w-28 sm:w-36 text-center border-0" data-testid="card-pending-count">
        <div className="text-4xl sm:text-5xl font-extrabold text-amber-500 dark:text-amber-400 leading-none transition duration-500">
          {pending}
        </div>
        <div className="mt-1 text-[10px] sm:text-xs font-medium tracking-widest uppercase text-muted-foreground">
          PENDING
        </div>
      </Card>

      <Card className="p-3 bg-card rounded-lg shadow-lg transition duration-300 hover:shadow-emerald-500/40 dark:hover:shadow-emerald-400/30 transform hover:scale-[1.03] w-28 sm:w-36 text-center border-0" data-testid="card-active-count">
        <div className="text-4xl sm:text-5xl font-extrabold text-emerald-500 dark:text-emerald-400 leading-none transition duration-500">
          {active}
        </div>
        <div className="mt-1 text-[10px] sm:text-xs font-medium tracking-widest uppercase text-muted-foreground">
          ACTIVE
        </div>
      </Card>
    </div>
  );
}
