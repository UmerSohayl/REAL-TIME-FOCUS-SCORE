
import React from 'react';

interface ScoreGaugeProps {
  score: number;
}

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score }) => {
  const normalizedScore = Math.max(0, Math.min(100, score));
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedScore / 100) * circumference;

  const getColor = () => {
    if (normalizedScore >= 75) return 'text-teal-400';
    if (normalizedScore >= 40) return 'text-yellow-400';
    return 'text-red-500';
  };

  const colorClass = getColor();

  return (
    <div className="relative w-36 h-36">
      <svg className="w-full h-full" viewBox="0 0 120 120">
        <circle
          className="text-slate-600"
          strokeWidth="10"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
        />
        <circle
          className={`${colorClass} transition-all duration-500`}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className={`absolute inset-0 flex flex-col items-center justify-center ${colorClass}`}>
        <span className="text-4xl font-bold">{normalizedScore}</span>
        <span className="text-xs font-medium tracking-wider uppercase">FOCUS</span>
      </div>
    </div>
  );
};

export default ScoreGauge;
