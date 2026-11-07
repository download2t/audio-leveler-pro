export function ProgressBar({
  value,
  size = 'md',
  tone = 'accent'
}: {
  value: number;
  size?: 'xs' | 'md';
  tone?: 'accent' | 'success' | 'danger';
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  return (
    <div
      className={`progress progress-${size} progress-${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
