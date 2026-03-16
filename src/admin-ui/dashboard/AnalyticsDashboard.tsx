import React, { useEffect, useState } from "react";
import { api, logger } from "@phantasy/agent/plugin-admin-ui";
import type { DailyActivitySummary } from "@phantasy/agent/plugin-admin-ui";

import styles from "./AnalyticsDashboard.module.css";

const log = logger.module("AnalyticsDashboard");

interface AnalyticsDashboardProps {
  days?: number;
}

interface MetricBarProps {
  className: string;
  size?: string;
  background?: string;
}

function MetricBar({ className, size, background }: MetricBarProps) {
  return (
    <div
      className={className}
      style={({ ["--analytics-bar-size" as string]: size, ["--analytics-bar-background" as string]: background } as React.CSSProperties)}
    />
  );
}

export function AnalyticsDashboard({ days = 30 }: AnalyticsDashboardProps) {
  const [history, setHistory] = useState<DailyActivitySummary[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(days);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const loadHistory = async () => {
      setLoading(true);
      try {
        const data = await api.monitoring.getActivityHistory(selectedPeriod, {
          signal: controller.signal,
        });
        setHistory(data);
      } catch (error) {
        if (!controller.signal.aborted) {
          log.error("Failed to fetch history", error as any);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadHistory();
    return () => {
      controller.abort();
    };
  }, [selectedPeriod]);

  const calculateTotals = () => {
    return history.reduce(
      (acc, day) => ({
        totalActivities: acc.totalActivities + day.totalActivities,
        chatMessages: acc.chatMessages + day.chatMessages,
        integrationCalls: acc.integrationCalls + day.integrationCalls,
        websocketConnections:
          acc.websocketConnections + (day.websocketConnections || 0),
        humanApprovals: acc.humanApprovals + (day.humanApprovals || 0),
        autoApprovals: acc.autoApprovals + (day.autoApprovals || 0),
        uniqueUsers: acc.uniqueUsers + day.uniqueUsers,
        errorCount: acc.errorCount + day.errorCount,
        totalTokens: acc.totalTokens + (day.totalTokens || 0),
        totalCost: acc.totalCost + (day.totalCost || 0),
      }),
      {
        totalActivities: 0,
        chatMessages: 0,
        integrationCalls: 0,
        websocketConnections: 0,
        humanApprovals: 0,
        autoApprovals: 0,
        uniqueUsers: 0,
        errorCount: 0,
        totalTokens: 0,
        totalCost: 0,
      },
    );
  };

  const getPlatformTotals = () => {
    const totals: Record<string, number> = {};
    history.forEach((day) => {
      Object.entries(day.platformBreakdown || {}).forEach(([platform, count]) => {
        totals[platform] = (totals[platform] || 0) + count;
      });
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };

  const getTopUsers = () => {
    const userMap = new Map<string, { username?: string; count: number }>();

    history.forEach((day) => {
      (day.topUsers || []).forEach((user) => {
        const existing = userMap.get(user.userId) || {
          username: user.username,
          count: 0,
        };
        existing.count += user.count;
        userMap.set(user.userId, existing);
      });
    });

    return Array.from(userMap.entries())
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  const getHourlyPattern = () => {
    const hourlyTotals: Record<string, number> = {};

    history.forEach((day) => {
      Object.entries(day.hourlyBreakdown || {}).forEach(([hour, count]) => {
        hourlyTotals[hour] = (hourlyTotals[hour] || 0) + count;
      });
    });

    return Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, "0");
      return {
        hour,
        count: hourlyTotals[hour] || 0,
      };
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return <div className={styles.loading}>Loading analytics...</div>;
  }

  const totals = calculateTotals();
  const platformTotals = getPlatformTotals();
  const topUsers = getTopUsers();
  const hourlyPattern = getHourlyPattern();
  const maxHourlyCount = Math.max(1, ...hourlyPattern.map((h) => h.count));
  const approvalRate =
    totals.humanApprovals + totals.autoApprovals > 0
      ? (
          (totals.autoApprovals /
            (totals.humanApprovals + totals.autoApprovals)) *
          100
        ).toFixed(1)
      : "0";

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Analytics Dashboard</h2>
        <div className={styles.periodSelector}>
          <button
            className={selectedPeriod === 7 ? styles.active : ""}
            onClick={() => setSelectedPeriod(7)}
          >
            7 Days
          </button>
          <button
            className={selectedPeriod === 30 ? styles.active : ""}
            onClick={() => setSelectedPeriod(30)}
          >
            30 Days
          </button>
          <button
            className={selectedPeriod === 90 ? styles.active : ""}
            onClick={() => setSelectedPeriod(90)}
          >
            90 Days
          </button>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {formatNumber(totals.totalActivities)}
          </div>
          <div className={styles.statLabel}>Total Activities</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {formatNumber(totals.chatMessages)}
          </div>
          <div className={styles.statLabel}>Chat Messages</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {formatNumber(totals.uniqueUsers)}
          </div>
          <div className={styles.statLabel}>Unique Users</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statValue}>{approvalRate}%</div>
          <div className={styles.statLabel}>Auto-Approval Rate</div>
          <div className={styles.statSubtext}>
            {totals.autoApprovals} auto / {totals.humanApprovals} manual
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {formatNumber(totals.totalTokens)}
          </div>
          <div className={styles.statLabel}>Tokens Used</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statValue}>${totals.totalCost.toFixed(2)}</div>
          <div className={styles.statLabel}>Total Cost</div>
        </div>
      </div>

      <div className={styles.chartsSection}>
        <div className={styles.chartCard}>
          <h3>Activity by Hour</h3>
          <div className={styles.hourlyChart}>
            {hourlyPattern.map(({ hour, count }) => (
              <div key={hour} className={styles.hourBar}>
                <MetricBar
                  className={styles.bar}
                  size={`${(count / maxHourlyCount) * 100}%`}
                  background={`rgba(0, 255, 136, ${0.3 + (count / maxHourlyCount) * 0.7})`}
                />
                <div className={styles.hourLabel}>{hour}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3>Top Platforms</h3>
          <div className={styles.platformList}>
            {platformTotals.map(([platform, count]) => (
              <div key={platform} className={styles.platformItem}>
                <div className={styles.platformName}>{platform}</div>
                <div className={styles.platformBar}>
                  <MetricBar
                    className={styles.platformProgress}
                    size={`${(count / platformTotals[0][1]) * 100}%`}
                  />
                </div>
                <div className={styles.platformCount}>
                  {formatNumber(count)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.usersSection}>
        <h3>Top Users</h3>
        <div className={styles.usersList}>
          {topUsers.map((user, index) => (
            <div key={user.userId} className={styles.userItem}>
              <div className={styles.userRank}>#{index + 1}</div>
              <div className={styles.userInfo}>
                <div className={styles.userName}>
                  {user.username || user.userId}
                </div>
                <div className={styles.userActivity}>
                  {formatNumber(user.count)} activities
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
