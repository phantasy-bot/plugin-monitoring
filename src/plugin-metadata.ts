import type { PluginManifest as RuntimePluginManifest } from "@phantasy/agent/plugins";

export const MONITORING_PLUGIN_METADATA = {
  name: "monitoring",
  version: "0.1.0",
  description: "Mini monitoring widgets using internal activity metrics",
  displayName: "Monitoring",
  category: "observability",
  tags: ["metrics", "monitoring"],
  permissions: [] as string[],
  workspace: "operations" as const,
  extensionKind: "capability" as const,
  configSchema: {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true },
    },
  },
  adminSurface: {
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
  },
} as const satisfies Pick<
  RuntimePluginManifest,
  | "name"
  | "version"
  | "description"
  | "displayName"
  | "category"
  | "tags"
  | "permissions"
  | "workspace"
  | "extensionKind"
  | "configSchema"
  | "adminSurface"
>;
