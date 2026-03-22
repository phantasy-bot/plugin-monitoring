import React, { useEffect, useState } from "react";
import { api, logger } from "@phantasy/agent/plugin-admin-ui";
import type { ContributionData } from "@phantasy/agent/plugin-admin-ui";

import styles from "./ContributionGraph.module.css";

const log = logger.module("ContributionGraph");

export interface ContributionGraphProps {
  days?: number;
  title?: string;
}

export function ContributionGraph({
  days = 365,
  title = "Agent Activity",
}: ContributionGraphProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [contributions, setContributions] = useState<ContributionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<ContributionData | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const controller = new AbortController();
    const loadContributions = async () => {
      setLoading(true);
      try {
        const data = await api.monitoring.getContributionData(
          days,
          selectedYear,
          { signal: controller.signal },
        );
        setContributions(data);
      } catch (error) {
        if (!controller.signal.aborted) {
          log.error("Failed to fetch contributions", error as any);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadContributions();
    return () => {
      controller.abort();
    };
  }, [days, selectedYear]);

  const getWeeksData = () => {
    const weeks: ContributionData[][] = [];
    let currentWeek: ContributionData[] = [];

    // Fill in days of the week before the first contribution
    const firstDate = contributions[0]?.date;
    if (firstDate) {
      const firstDay = new Date(firstDate).getDay();
      for (let i = 0; i < firstDay; i++) {
        currentWeek.push({ date: "", count: 0, level: -1 }); // Empty cells
      }
    }

    contributions.forEach((day) => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      // Fill remaining days of the last week
      while (currentWeek.length < 7) {
        currentWeek.push({ date: "", count: 0, level: -1 });
      }
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const getMonthLabels = () => {
    const months: Array<{ month: string; weekIndex: number }> = [];
    let lastMonth = -1;
    let lastWeekIndex = -5;

    contributions.forEach((day, index) => {
      const date = new Date(day.date);
      const month = date.getMonth();

      if (month !== lastMonth) {
        const weekIndex = Math.floor(
          (index + new Date(contributions[0].date).getDay()) / 7,
        );
        if (weekIndex - lastWeekIndex >= 4) {
          months.push({
            month: date.toLocaleDateString("en-US", { month: "short" }),
            weekIndex,
          });
          lastWeekIndex = weekIndex;
        }
        lastMonth = month;
      }
    });

    return months;
  };

  const getLevelClass = (level: number) => {
    if (level === -1) return styles.empty;
    return styles[`level${level}`];
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return <div className={styles.loading}>Loading activity data...</div>;
  }

  const weeks = getWeeksData();
  const months = getMonthLabels();
  const monthLabelsByWeek = new Map(
    months.map((month) => [month.weekIndex, month.month]),
  );
  const totalActivities = contributions.reduce(
    (sum, day) => sum + day.count,
    0,
  );
  const activeDays = contributions.filter((day) => day.count > 0).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>{title}</h3>
        <div className={styles.stats}>
          <span>{totalActivities.toLocaleString()} activities</span>
          <span>{activeDays} active days</span>
        </div>
        <div className={styles.yearSelector}>
          <button
            className={styles.yearButton}
            onClick={() => setSelectedYear(selectedYear - 1)}
          >
            ←
          </button>
          <span className={styles.yearLabel}>{selectedYear}</span>
          <button
            className={styles.yearButton}
            onClick={() => setSelectedYear(selectedYear + 1)}
            disabled={selectedYear >= currentYear}
          >
            →
          </button>
        </div>
      </div>

      <div className={styles.graphWrapper}>
        <div className={styles.weekdays}>
          <div>Mon</div>
          <div>Wed</div>
          <div>Fri</div>
        </div>

        <div className={styles.graphContent}>
          <div className={styles.months}>
            {weeks.map((_, index) => (
              <div key={index} className={styles.monthAnchor}>
                {monthLabelsByWeek.has(index) ? (
                  <div className={styles.monthLabel}>
                    {monthLabelsByWeek.get(index)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className={styles.graph}>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className={styles.week}>
                {week.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={`${styles.day} ${getLevelClass(day.level)}`}
                    onMouseEnter={(e) => {
                      if (day.date) {
                        setHoveredDay(day);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMousePos({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.legend}>
        <span>Less</span>
        <div className={`${styles.day} ${styles.level0}`} />
        <div className={`${styles.day} ${styles.level1}`} />
        <div className={`${styles.day} ${styles.level2}`} />
        <div className={`${styles.day} ${styles.level3}`} />
        <div className={`${styles.day} ${styles.level4}`} />
        <span>More</span>
      </div>

      {hoveredDay && (
        <div
          className={styles.tooltip}
          style={{ ["--contribution-tooltip-left" as string]: `${mousePos.x}px`, ["--contribution-tooltip-top" as string]: `${mousePos.y - 60}px` }}
        >
          <strong>{formatDate(hoveredDay.date)}</strong>
          <br />
          {hoveredDay.count} activities
        </div>
      )}
    </div>
  );
}
