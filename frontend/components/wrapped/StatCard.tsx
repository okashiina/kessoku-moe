// A single headline stat as large type on the ink ground. `accent` puts the
// figure on a solid pink plate so one number reads as the lead, not a row of
// matching tiles.
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
  <div className={className}>
    <div
      className={
        accent
          ? 'inline-block rounded-[5px] bg-[#f591ba] px-4 py-3 sm:px-5 sm:py-4'
          : undefined
      }
    >
      <p
        className={`font-display tabular-nums leading-none tracking-tight ${
          accent
            ? 'text-5xl font-extrabold text-[#17141c] sm:text-6xl'
            : 'text-4xl font-extrabold text-[#f4ecef] sm:text-5xl'
        }`}
      >
        {fmt(value)}
      </p>
      <p
        className={`mt-2 font-display text-base font-extrabold tracking-tight ${
          accent ? 'text-[#17141c]' : 'text-[#f4ecef]'
        }`}
      >
        {label}
      </p>
      {hint && (
        <p
          className={`mt-1 text-sm ${
            accent ? 'text-[#17141c]/75' : 'text-[#bfb2c1]'
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  </div>
);

export default StatCard;
