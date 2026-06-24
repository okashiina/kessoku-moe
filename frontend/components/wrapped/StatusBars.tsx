// A status breakdown as labelled rows with a proportional fill, not a third grid
// of bare numbers. Each row's bar width is relative to the largest bucket so the
// shape of someone's shelf (mostly reading? mostly planned?) reads at a glance.
interface Row {
  label: string;
  count: number;
}

interface StatusBarsProps {
  title: string;
  rows: Row[];
}

const StatusBars: React.FC<StatusBarsProps> = ({ title, rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <section className="rounded-2xl border border-line/50 bg-surface/40 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base font-bold text-fg">{title}</h3>
        <span className="text-xs font-medium tabular-nums text-muted">
          {total} {total === 1 ? 'title' : 'titles'}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm text-fg">{r.label}</span>
              <span className="text-sm font-semibold tabular-nums text-fg">
                {r.count}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-canvas-2"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-aurora"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default StatusBars;
