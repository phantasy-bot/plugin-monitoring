import fs from "fs/promises";
import os from "os";
import nodePath from "path";

import { BasePlugin, DashboardWidget } from "@phantasy/agent/plugins";
import {
  createPluginModuleLogger,
  getActivityTracker,
  getAuditTrailService,
  listReflectionArtifacts,
  resolveAgentConversationContext,
  resolveWorkspaceRoot,
  runReflectionCycle,
} from "@phantasy/agent/plugin-runtime";

const log = createPluginModuleLogger("MonitoringPlugin");

type MonitoringActivityMetric = {
  type?: string;
  timestamp?: Date | string;
  details?: {
    action?: string;
    platform?: string;
  };
};

const BROWSER_ARTIFACT_FILE_PATTERN =
  /^browser-artifact[_-][a-z0-9_-]+\.(?:png|jpe?g|webp)$/i;

function getBrowserArtifactMimeType(fileName: string): string | null {
  const extension = nodePath.extname(fileName).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  return null;
}

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getIntSearchParam(
  url: URL,
  key: string,
  fallback: number,
): number {
  const raw = Number.parseInt(url.searchParams.get(key) || "", 10);
  return Number.isFinite(raw) ? raw : fallback;
}

function createSseResponse(options: {
  initialData?: unknown;
  onStart: (sendData: (data: unknown) => void) => (() => void) | void;
}): Response {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendData = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const sendComment = (comment: string = "heartbeat") => {
        controller.enqueue(encoder.encode(`: ${comment}\n\n`));
      };

      if (typeof options.initialData !== "undefined") {
        sendData(options.initialData);
      }

      const heartbeat = setInterval(() => {
        sendComment();
      }, 30000);
      const startedCleanup = options.onStart(sendData);

      cleanup = () => {
        clearInterval(heartbeat);
        startedCleanup?.();
      };
    },
    cancel() {
      cleanup?.();
      cleanup = undefined;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function resolveMonitoringAgentContext(request: Request): Promise<{
  agentId: string;
  workspacePath?: string;
  conversationMemory: Awaited<
    ReturnType<typeof resolveAgentConversationContext>
  >["conversationMemory"];
}> {
  const env =
    ((request as Request & { env?: Record<string, string | undefined> }).env as
      | Record<string, string | undefined>
      | undefined) || (process.env as Record<string, string | undefined>);
  const agentContext = await resolveAgentConversationContext(env);
  return {
    agentId: agentContext.agentId,
    workspacePath: agentContext.workspacePath,
    conversationMemory: agentContext.conversationMemory,
  };
}

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
    request: Request,
    path: string,
  ): Promise<Response | null> {
    try {
      const url = new URL(request.url);
      const activityTracker = getActivityTracker();

      if (path === "/realtime" && request.method === "GET") {
        return jsonResponse(activityTracker.getRealtimeMetrics());
      }

      const dailyMatch = path.match(/^\/daily\/([^/]+)$/);
      if (dailyMatch && request.method === "GET") {
        const summary = await activityTracker.getDailySummary(dailyMatch[1]);
        if (!summary) {
          return jsonResponse({ error: "No data for this date" }, 404);
        }
        return jsonResponse(summary);
      }

      if (path === "/history" && request.method === "GET") {
        const history = await activityTracker.getActivityHistory(
          getIntSearchParam(url, "days", 30),
        );
        return jsonResponse(history);
      }

      if (path === "/contributions" && request.method === "GET") {
        const contributions = await activityTracker.getContributionData(
          getIntSearchParam(url, "days", 365),
        );
        return jsonResponse(contributions);
      }

      if (path === "/stream" && request.method === "GET") {
        return createSseResponse({
          initialData: {
            type: "initial",
            data: activityTracker.getRealtimeMetrics(),
          },
          onStart: (sendData) => {
            const sendActivity = (activity: unknown) => {
              sendData(activity);
            };
            activityTracker.on("activity", sendActivity);
            return () => {
              activityTracker.removeListener("activity", sendActivity);
            };
          },
        });
      }

      if (path === "/track" && request.method === "POST") {
        const activity = await request.json();
        await activityTracker.trackActivity(activity);
        return jsonResponse({ success: true });
      }

      if (path === "/sessions/search" && request.method === "GET") {
        const query = String(url.searchParams.get("query") || "").trim();
        if (!query) {
          return jsonResponse({ error: "query is required" }, 400);
        }

        const { agentId, conversationMemory } =
          await resolveMonitoringAgentContext(request);
        const results = await conversationMemory.searchSessionMessages({
          query,
          userId: url.searchParams.get("userId") || undefined,
          sessionId: url.searchParams.get("sessionId") || undefined,
          platform: url.searchParams.get("platform") || undefined,
          limit: getIntSearchParam(url, "limit", 50),
        });

        return jsonResponse({ agentId, results });
      }

      if (path === "/sessions" && request.method === "GET") {
        const { agentId, conversationMemory } =
          await resolveMonitoringAgentContext(request);
        const sessions = await conversationMemory.listSessions({
          userId: url.searchParams.get("userId") || undefined,
          search: url.searchParams.get("search") || undefined,
          platform: url.searchParams.get("platform") || undefined,
          limit: getIntSearchParam(url, "limit", 50),
        });

        return jsonResponse({ agentId, sessions });
      }

      const sessionMessagesMatch = path.match(/^\/sessions\/([^/]+)\/messages$/);
      if (sessionMessagesMatch && request.method === "GET") {
        const { agentId, conversationMemory } =
          await resolveMonitoringAgentContext(request);
        const session = await conversationMemory.getSession(
          sessionMessagesMatch[1],
          {
            userId: url.searchParams.get("userId") || undefined,
          },
        );

        if (!session) {
          return jsonResponse({ error: "Session not found" }, 404);
        }

        return jsonResponse({
          agentId,
          messages: session.messages.slice(
            -Math.max(1, Math.min(getIntSearchParam(url, "limit", 200), 500)),
          ),
        });
      }

      const sessionDetailMatch = path.match(/^\/sessions\/([^/]+)$/);
      if (sessionDetailMatch && request.method === "GET") {
        const { agentId, workspacePath, conversationMemory } =
          await resolveMonitoringAgentContext(request);
        const session = await conversationMemory.getSession(
          sessionDetailMatch[1],
          {
            userId: url.searchParams.get("userId") || undefined,
          },
        );

        if (!session) {
          return jsonResponse({ error: "Session not found" }, 404);
        }

        const auditEvents = await getAuditTrailService(workspacePath).list({
          agentId,
          userId: session.userId,
          sessionId: session.sessionId,
          limit: 200,
        });

        return jsonResponse({
          agentId,
          session,
          auditEvents,
        });
      }

      if (path === "/audit/events" && request.method === "GET") {
        const { agentId, workspacePath } =
          await resolveMonitoringAgentContext(request);
        const events = await getAuditTrailService(workspacePath).list({
          agentId,
          kind: url.searchParams.get("kind") as any,
          action: url.searchParams.get("action") || undefined,
          status: url.searchParams.get("status") as any,
          userId: url.searchParams.get("userId") || undefined,
          sessionId: url.searchParams.get("sessionId") || undefined,
          platform: url.searchParams.get("platform") || undefined,
          workflowId: url.searchParams.get("workflowId") || undefined,
          toolName: url.searchParams.get("toolName") || undefined,
          skillName: url.searchParams.get("skillName") || undefined,
          search: url.searchParams.get("search") || undefined,
          limit: getIntSearchParam(url, "limit", 100),
          sinceDays: getIntSearchParam(url, "sinceDays", 7),
        });

        return jsonResponse({ agentId, events });
      }

      if (path === "/audit/summary" && request.method === "GET") {
        const { agentId, workspacePath } =
          await resolveMonitoringAgentContext(request);
        const summary = await getAuditTrailService(workspacePath).getSummary({
          agentId,
          sinceDays: getIntSearchParam(url, "sinceDays", 7),
        });
        return jsonResponse({ agentId, summary });
      }

      if (path === "/audit/stream" && request.method === "GET") {
        const { agentId, workspacePath } =
          await resolveMonitoringAgentContext(request);
        const auditTrail = getAuditTrailService(workspacePath);
        return createSseResponse({
          onStart: (sendData) =>
            auditTrail.subscribe((event) => {
              if (event.agentId && event.agentId !== agentId) {
                return;
              }
              sendData(event);
            }),
        });
      }

      const browserArtifactMatch = path.match(
        /^\/audit\/browser-artifacts\/([^/]+)$/,
      );
      if (browserArtifactMatch && request.method === "GET") {
        const fileName = String(browserArtifactMatch[1] || "");
        if (!BROWSER_ARTIFACT_FILE_PATTERN.test(fileName)) {
          return jsonResponse({ error: "Invalid browser artifact file" }, 400);
        }

        const mimeType = getBrowserArtifactMimeType(fileName);
        if (!mimeType) {
          return jsonResponse({ error: "Unsupported browser artifact type" }, 400);
        }

        const { workspacePath } = await resolveMonitoringAgentContext(request);
        const artifactPath = nodePath.join(
          resolveWorkspaceRoot(workspacePath),
          "audit",
          "browser-artifacts",
          fileName,
        );

        try {
          const artifact = await fs.readFile(artifactPath);
          return jsonResponse({
            fileName,
            imageUrl: `data:${mimeType};base64,${artifact.toString("base64")}`,
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
            return jsonResponse({ error: "Browser artifact not found" }, 404);
          }
          throw error;
        }
      }

      if (path === "/reflections" && request.method === "GET") {
        const { agentId, workspacePath } =
          await resolveMonitoringAgentContext(request);
        const artifacts = await listReflectionArtifacts(workspacePath, agentId);
        return jsonResponse({ agentId, artifacts });
      }

      if (path === "/reflections/run" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as {
          minOccurrences?: number;
          maxArtifacts?: number;
        };
        const { agentId, workspacePath } =
          await resolveMonitoringAgentContext(request);
        const result = await runReflectionCycle({
          agentId,
          workspaceRoot: workspacePath,
          minOccurrences: body?.minOccurrences,
          maxArtifacts: body?.maxArtifacts,
        });
        return jsonResponse({ agentId, ...result });
      }

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
      log.error("Monitoring custom endpoint failed", {
        path,
        error: _error instanceof Error ? _error.message : String(_error),
      });
      return jsonResponse({ error: "failed" }, 500);
    }

    return null;
  }
}
