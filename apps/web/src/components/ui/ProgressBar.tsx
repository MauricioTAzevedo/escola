export interface ProgressBarProps {
  value: number; // 0 to 1 or 0 to 100
  label?: string;
  showPercent?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ProgressBar({ value, label, showPercent = true, size = 'md' }: ProgressBarProps) {
  const percentage = Math.min(Math.max(value <= 1 ? value * 100 : value, 0), 100);

  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  const getColor = (pct: number) => {
    if (pct < 40) return 'bg-rose-500';
    if (pct < 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="w-full space-y-1">
      {(label || showPercent) && (
        <div className="flex justify-between items-center text-xs font-medium text-slate-600">
          {label && <span>{label}</span>}
          {showPercent && <span>{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className={`${heights[size]} ${getColor(percentage)} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
