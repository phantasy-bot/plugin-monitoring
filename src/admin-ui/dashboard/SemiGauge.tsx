import React from "react";
import styles from "./SemiGauge.module.css";

interface SemiGaugeProps {
  value: number;
  label?: string;
  width?: number;
  height?: number;
}

/**
 * Lightweight semi-circle gauge for analytics widgets.
 * Displays a percentage value as an arc with optional label.
 */
export function SemiGauge({
  value,
  label = "",
  width = 80,
  height = 40,
}: SemiGaugeProps) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const r = Math.min(width, height) - 4;
  const cx = width / 2;
  const cy = height;
  const angle = Math.PI * (1 - pct / 100);
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const largeArc = pct > 50 ? 1 : 0;
  const trackPath = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;
  const valuePath = `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y}`;

  return (
    <div className={styles.root}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={trackPath}
          stroke="var(--border-color)"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={valuePath}
          stroke="var(--accent-primary)"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <div className={styles.label}>
          {label}
        </div>
      )}
    </div>
  );
}

export default SemiGauge;
