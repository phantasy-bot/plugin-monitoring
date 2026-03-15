import { BasePlugin, DashboardWidget } from "@phantasy/agent/plugins";
import { getActivityTracker } from "@phantasy/agent/plugin-runtime";
import os from "os";

type MonitoringActivityMetric = {
  type?: string;
  timestamp?: Date | string;
  details?: {
    action?: string;
    platform?: string;
  };
};

export default class MonitoringPlugin extends BasePlugin {
  name = "monitoring";
  version = "0.1.0";
  description = "Mini monitoring widgets using internal activity metrics";
  protected displayName = "Monitoring";
  protected category = "observability";
  protected tags = ["metrics", "monitoring"];
  protected permissions: string[] = [];
  protected workspace = "operations" as const;
  protected extensionKind = "capability" as const;
  protected configSchema = {
    type: "object",
    properties: { enabled: { type: "boolean", default: true } },
  };
  protected adminSurface = {
    tabId: "monitoring",
    label: "Monitoring",
    section: "operations",
    workspace: "operations",
    kind: "native",
    entry: "/admin-ui/index.js",
    assetRoot: "admin-ui-dist",
    keywords: ["logs", "metrics", "analytics", "stats"],
    dashboardIcon: "analyticsTile2",
    dashboardPromoted: false,
  } as const;

  getDashboardWidgets(): DashboardWidget[] {
    return [
      { id: "overview", title: "Monitoring", icon: "activity", dataPath: "/widgets/overview" },
      { id: "uptime", title: "Uptime", icon: "clock", dataPath: "/widgets/uptime" },
      { id: "cpu", title: "CPU Load", icon: "cpu", dataPath: "/widgets/cpu" },
      { id: "memory", title: "Memory", icon: "memory", dataPath: "/widgets/memory" },
      { id: "recent", title: "Recent Activity", icon: "activity", dataPath: "/widgets/recent" },
      { id: "totals", title: "Totals (30d)", icon: "chart", dataPath: "/widgets/totals" },
      { id: "rpm", title: "Requests/min", icon: "chart", dataPath: "/widgets/rpm" },
      { id: "integrations", title: "Active Integrations", icon: "plug", dataPath: "/widgets/integrations" },
      { id: "websockets", title: "Active WebSockets", icon: "monitor", dataPath: "/widgets/websockets" },
      { id: "cluster", title: "Realtime Cluster", icon: "grid", dataPath: "/widgets/cluster" },
    ];
  }

  async handleCustomEndpoint(
    _request: Request,
    path: string,
  ): Promise<Response | null> {
    try {
      const activityTracker = getActivityTracker();

      if (path === "/widgets/overview") {
        const metrics = activityTracker.getRealtimeMetrics();
        const payload = {
          activeWebsockets: metrics.activeWebsockets,
          rpm: metrics.currentLoad?.requestsPerMinute || 0,
          recent: (metrics.recentActivities || []).slice(0, 5).map((metric) => ({
            type: metric.type,
            when: metric.timestamp,
            details: metric.details?.action || metric.details?.platform || "",
          })),
        };
        return new Response(
          JSON.stringify({ widget: "monitoring.overview", data: payload }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/uptime") {
        const metrics = activityTracker.getRealtimeMetrics();
        const uptimeMs = Number(metrics.uptime || 0);
        const rpm = Number(metrics.currentLoad?.requestsPerMinute || 0);
        return new Response(
          JSON.stringify({ widget: "monitoring.uptime", data: { uptimeMs, rpm } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/cpu") {
        const load1 = os.loadavg()[0] || 0;
        const cores = Math.max(1, (os.cpus() || []).length || 1);
        const cpuPercent = Math.max(0, Math.min(100, (load1 / cores) * 100));
        const rpm = Number(
          activityTracker.getRealtimeMetrics().currentLoad?.requestsPerMinute || 0,
        );
        return new Response(
          JSON.stringify({
            widget: "monitoring.cpu",
            data: { load1, cores, cpuPercent, rpm },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/memory") {
        const mu = process.memoryUsage();
        const rssMB = mu.rss / 1024 / 1024;
        const heapMB = mu.heapUsed / 1024 / 1024;
        const totalMB = os.totalmem() / 1024 / 1024;
        const memoryPercent = Math.max(0, Math.min(100, (rssMB / totalMB) * 100));
        return new Response(
          JSON.stringify({
            widget: "monitoring.memory",
            data: { rssMB, heapMB, totalMB, memoryPercent },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/recent") {
        const metrics = activityTracker.getRealtimeMetrics();
        const items = (metrics.recentActivities || [])
          .slice(0, 5)
          .map((metric: MonitoringActivityMetric) => ({
            type: metric.type,
            when: metric.timestamp,
            details: metric.details?.action || metric.details?.platform || "",
          }));
        return new Response(
          JSON.stringify({ widget: "monitoring.recent", data: { items } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/totals") {
        const history = await activityTracker.getActivityHistory(30);
        const totals = {
          totalActivities: history.reduce((a, b) => a + (b.totalActivities || 0), 0),
          chatMessages: history.reduce((a, b) => a + (b.chatMessages || 0), 0),
          integrationCalls: history.reduce((a, b) => a + (b.integrationCalls || 0), 0),
          websocketConnections: history.reduce(
            (a, b) => a + (b.websocketConnections || 0),
            0,
          ),
          uniqueUsers: history.reduce((a, b) => a + (b.uniqueUsers || 0), 0),
        };
        return new Response(
          JSON.stringify({ widget: "monitoring.totals", data: totals }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/rpm") {
        const rpm = Number(
          activityTracker.getRealtimeMetrics().currentLoad?.requestsPerMinute || 0,
        );
        return new Response(
          JSON.stringify({ widget: "monitoring.rpm", data: { rpm } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/integrations") {
        const integrations =
          activityTracker.getRealtimeMetrics().activeIntegrations || [];
        return new Response(
          JSON.stringify({
            widget: "monitoring.integrations",
            data: { integrations },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/websockets") {
        const count = Number(
          activityTracker.getRealtimeMetrics().activeWebsockets || 0,
        );
        return new Response(
          JSON.stringify({ widget: "monitoring.websockets", data: { count } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/widgets/cluster") {
        const metrics = activityTracker.getRealtimeMetrics();
        const rpm = Number(metrics.currentLoad?.requestsPerMinute || 0);
        const websockets = Number(metrics.activeWebsockets || 0);
        const integrations = metrics.activeIntegrations || [];
        return new Response(
          JSON.stringify({
            widget: "monitoring.cluster",
            data: { rpm, websockets, integrations },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (_error) {
      return new Response(JSON.stringify({ error: "failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return null;
  }
}
