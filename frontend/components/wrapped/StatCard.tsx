// A single big-number stat. `accent` lifts the headline figure onto the aurora
// gradient for the one or two stats that matter most; the rest stay quiet so the
// page reads as a hierarchy, not an even grid of identical tiles.
interface StatCardProps {
  value: number;
  label: string;
  hint?: string;
  accent?: boolean;
  className?: string;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

const StatCard: React.FC<StatCardProps> = ({
  value,
  label,
  hint,
  accent = false,
  className = '',
}) => (
  <div
    className={`relative overflow-hidden rounded-2xl border p-5 ${
      accent
        ? 'border-transparent bg-aurora text-accent-ink shadow-glow'
        : 'border-line/50 bg-surface/40 text-fg'
    } ${className}`}
  >
    <p
      className={`font-display text-4xl font-extrabold tabular-nums leading-none tracking-tight sm:text-5xl ${
        accent ? 'text-accent-ink' : 'text-fg'
      }`}
    >
      {fmt(value)}
    </p>
    <p
      className={`mt-2 text-sm font-semibold ${
        accent ? 'text-accent-ink' : 'text-fg'
      }`}
    >
      {label}
    </p>
    {hint && (
      <p
        className={`mt-0.5 text-xs ${
          accent ? 'text-accent-ink' : 'text-muted'
        }`}
      >
        {hint}
      </p>
    )}
  </div>
);

export default StatCard;
