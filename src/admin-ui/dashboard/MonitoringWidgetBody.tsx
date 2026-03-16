import React from "react";
import { SemiGauge } from "./SemiGauge";
import { ContributionGraph } from "./ContributionGraph";
import { Sparkline } from "./Sparkline";
import styles from "./DashboardWidgetPrimitives.module.css";

interface MonitoringWidgetProps {
  id: string;
  data: any;
  history?: Array<{ date: string; totalActivities: number }>;
  uptimeTickMs?: number | null;
}

/**
 * Renders monitoring-specific widget content based on widget ID.
 */
export function MonitoringWidgetBody({
  id,
  data,
  history = [],
  uptimeTickMs,
}: MonitoringWidgetProps) {
  if (id === "overview") {
    return (
      <div className={styles.overviewPanel}>
        <div className={styles.row}>
          <div className={styles.fill}>
            <ContributionGraph days={365} title="" />
          </div>
          <div className={styles.row}>
            <Sparkline
              values={history.map((d) => d.totalActivities)}
              width={220}
              height={32}
            />
          </div>
        </div>
      </div>
    );
  }

  if (id === "uptime" && (data || uptimeTickMs !== null)) {
    return (
      <div className={styles.row}>
        <SemiGauge value={100} label="Uptime" />
        <div className={styles.metricMeta}>
          <div>Uptime</div>
          <div className={styles.metricValue}>
            {(() => {
              const ms = uptimeTickMs ?? Number((data as any)?.uptimeMs || 0);
              const s = Math.floor(ms / 1000);
              const h = Math.floor(s / 3600);
              const m = Math.floor((s % 3600) / 60);
              return `${h}h ${m}m`;
            })()}
          </div>
          <div>RPM: {Number(data?.rpm || 0)}</div>
        </div>
      </div>
    );
  }

  if (id === "cpu" && data) {
    return (
      <div className={styles.row}>
        <SemiGauge value={Number(data.cpuPercent || 0)} label="CPU" />
        <div className={styles.metricMeta}>
          <div>CPU</div>
          <div className={styles.metricValue}>
            {Math.round(Number(data.cpuPercent || 0))}%
          </div>
          <div>
            Load (1m): {Number(data.load1 || 0).toFixed(2)} /{" "}
            {Number(data.cores || 1)} cores
          </div>
          {typeof data.rpm !== "undefined" && (
            <div>RPM: {Number(data.rpm || 0)}</div>
          )}
        </div>
      </div>
    );
  }

  if (id === "memory" && data) {
    return (
      <div className={styles.row}>
        <SemiGauge value={Number(data.memoryPercent || 0)} label="Memory" />
        <div className={styles.metricMeta}>
          <div>Memory</div>
          <div className={styles.metricValue}>
            {Math.round(Number(data.memoryPercent || 0))}%
          </div>
          <div>
            {Number(data.rssMB || 0).toFixed(1)} MB /{" "}
            {Number(data.totalMB || 0).toFixed(0)} MB (RSS)
          </div>
          <div>Heap: {Number(data.heapMB || 0).toFixed(1)} MB</div>
        </div>
      </div>
    );
  }

  if (id === "recent" && data) {
    return (
      <div className={styles.stack}>
        {Array.isArray(data.items) && data.items.length > 0 ? (
          data.items.map((it: any, i: number) => (
            <div key={i} className={styles.itemCard}>
              <div className={styles.itemMetaRow}>
                <span className={styles.metricMeta}>
                  {String(it.type).toUpperCase()}
                </span>
                {it.platform && (
                  <span className={styles.metricMeta}>{it.platform}</span>
                )}
                {it.user && (
                  <span className={styles.metricMeta}>@{it.user}</span>
                )}
              </div>
              <div className={styles.timestamp}>
                {it.at ? new Date(it.at).toLocaleTimeString() : ""}
              </div>
            </div>
          ))
        ) : (
          <div className={styles.metricMeta}>No recent activity</div>
        )}
      </div>
    );
  }

  if (id === "totals" && data) {
    return (
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Activities (30d)</div>
          <div className={styles.statValue}>
            {Number(data?.totals?.totalActivities || 0)}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Chat Messages</div>
          <div className={styles.statValue}>
            {Number(data?.totals?.chatMessages || 0)}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Unique Users (max)</div>
          <div className={styles.statValue}>
            {Number(data?.totals?.uniqueUsers || 0)}
          </div>
        </div>
      </div>
    );
  }

  if (id === "rpm" && data) {
    return (
      <div className={styles.row}>
        <div className={styles.valueXl}>
          {Number(data.rpm || 0)}
        </div>
        <div className={styles.metricMeta}>requests / min</div>
      </div>
    );
  }

  if (id === "integrations" && data) {
    return (
      <div>
        <div className={styles.statValue}>
          {Number(data.count || 0)} active
        </div>
        <div className={styles.chipRow}>
          {Array.isArray(data.items) &&
            data.items.map((it: any, i: number) => (
              <span key={i} className={styles.chip}>{it}</span>
            ))}
        </div>
      </div>
    );
  }

  if (id === "websockets" && data) {
    return (
      <div>
        <div className={styles.valueXl}>
          {Number(data.count || 0)}
        </div>
        <div className={styles.metricMeta}>active websockets</div>
      </div>
    );
  }

  if (id === "cluster" && data) {
    return (
      <div className={styles.rowBetween}>
        <div className={styles.baselineRow}>
          <div className={styles.valueXl}>
            {Number(data.rpm || 0)}
          </div>
          <div className={styles.metricMeta}>req/min</div>
        </div>
        <div className={styles.baselineRow}>
          <div className={styles.valueLg}>
            {Number(data.websockets || 0)}
          </div>
          <div className={styles.metricMeta}>websockets</div>
        </div>
        <div className={styles.baselineRow}>
          <div className={styles.valueLg}>
            {Array.isArray(data.integrations) ? data.integrations.length : 0}
          </div>
          <div className={styles.metricMeta}>integrations</div>
        </div>
      </div>
    );
  }

  return null;
}

export default MonitoringWidgetBody;
