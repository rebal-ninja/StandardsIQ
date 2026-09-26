import { cn } from '../lib/utils';

type MatchScoreProps = {
  score: number;
  size?: number;
  className?: string;
};

/**
 * Circular progress indicator for match scores.
 * Uses inline SVG — no external dependency required.
 */
const MatchScore = ({ score, size = 40, className }: MatchScoreProps) => {
  const clampedScore = Math.max(0, Math.min(100, score));

  const getColor = () => {
    if (clampedScore >= 70) return '#2DD4BF';
    if (clampedScore >= 40) return '#F5A524';
    return '#F3554F';
  };

  const getTextColor = () => {
    if (clampedScore >= 70) return 'text-accent-teal';
    if (clampedScore >= 40) return 'text-accent-amber';
    return 'text-accent-red';
  };

  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clampedScore / 100) * circumference;
  const color = getColor();

  return (
    <div className={cn('flex items-center gap-2 shrink-0', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className={`mono text-sm font-medium ${getTextColor()}`}>
        {clampedScore.toFixed(0)}%
      </span>
    </div>
  );
};

export default MatchScore;
