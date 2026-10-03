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
    <section className="min-w-0 flex-1">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold tracking-tight text-[#f4ecef]">
          {title}
        </h3>
        <span className="text-xs font-bold tabular-nums text-[#bfb2c1]">
          {total} {total === 1 ? 'title' : 'titles'}
        </span>
      </div>
      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm text-[#f4ecef]">{r.label}</span>
              <span className="text-sm font-bold tabular-nums text-[#f4ecef]">
                {r.count}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-[5px] bg-[#221c26]"
              aria-hidden
            >
              <div
                className="h-full rounded-[5px] bg-[#f591ba]"
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
