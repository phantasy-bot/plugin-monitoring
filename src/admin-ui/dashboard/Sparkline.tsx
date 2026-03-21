import React from 'react';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export function Sparkline({ values, width = 160, height = 32, color = 'var(--success)', strokeWidth = 2 }: SparklineProps) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - strokeWidth) - strokeWidth / 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth={strokeWidth} points={points} />
    </svg>
  );
}

export default Sparkline;

