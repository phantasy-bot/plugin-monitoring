import {
  registerPluginAdminSurface,
  type PluginAdminNativeMountContext,
} from "@phantasy/agent/plugin-admin-ui";

type MonitoringWidgetResponse<T> = {
  widget: string;
  data: T;
};

type RecentItem = {
  type?: string;
  when?: string;
  details?: string;
};

const STYLE_ID = "phantasy-plugin-monitoring-admin-surface";
const STYLE_TEXT = [
  ".phantasyMonitoringRoot{min-height:560px;padding:28px;background:radial-gradient(circle at top, rgba(102,240,165,0.12), transparent 32%),radial-gradient(circle at right, rgba(105,212,255,0.16), transparent 28%),linear-gradient(180deg,#08111d 0%,#050b14 100%);color:#ecf3ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;}",
  ".phantasyMonitoringRoot *{box-sizing:border-box;}",
  ".phantasyMonitoringMain{width:min(1180px,100%);margin:0 auto;}",
  ".phantasyMonitoringHero{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;}",
  ".phantasyMonitoringEyebrow{margin:0 0 10px;color:#69d4ff;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;}",
  ".phantasyMonitoringTitle{margin:0;font-size:clamp(28px,4vw,42px);line-height:1.05;}",
  ".phantasyMonitoringLead{max-width:720px;margin:10px 0 0;color:#95acc9;line-height:1.6;}",
  ".phantasyMonitoringActions{display:flex;gap:10px;}",
  ".phantasyMonitoringButton{appearance:none;border:1px solid rgba(115,167,255,0.22);border-radius:999px;padding:10px 14px;background:rgba(12,24,40,0.94);color:#ecf3ff;cursor:pointer;font:inherit;}",
  ".phantasyMonitoringStatus{margin-bottom:16px;min-height:20px;color:#95acc9;font-size:13px;}",
  ".phantasyMonitoringGrid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:18px;}",
  ".phantasyMonitoringCard,.phantasyMonitoringPanel{border:1px solid rgba(115,167,255,0.22);border-radius:18px;background:rgba(12,24,40,0.94);box-shadow:0 24px 70px rgba(0,0,0,0.24);}",
  ".phantasyMonitoringCard{padding:16px;}",
  ".phantasyMonitoringCardLabel{margin:0 0 8px;color:#95acc9;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;}",
  ".phantasyMonitoringCardValue{font-size:28px;font-weight:700;}",
  ".phantasyMonitoringCardMeta{margin-top:6px;color:#95acc9;font-size:13px;}",
  ".phantasyMonitoringColumns{display:grid;gap:14px;grid-template-columns:1.4fr 1fr;}",
  ".phantasyMonitoringPanel{padding:16px;}",
  ".phantasyMonitoringPanelTitle{margin:0 0 12px;font-size:16px;}",
  ".phantasyMonitoringList{margin:0;padding:0;list-style:none;}",
  ".phantasyMonitoringItem{padding:12px 0;border-top:1px solid rgba(255,255,255,0.06);}",
  ".phantasyMonitoringItem:first-child{padding-top:0;border-top:0;}",
  ".phantasyMonitoringItemType{color:#9bf0ff;font-size:13px;text-transform:capitalize;}",
  ".phantasyMonitoringItemMeta{color:#95acc9;font-size:13px;line-height:1.5;}",
  ".phantasyMonitoringGood{color:#66f0a5;}",
  "@media (max-width:860px){.phantasyMonitoringColumns{grid-template-columns:1fr;}}",
].join("");

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  doc.head.appendChild(style);
}

function createCardMarkup(
  label: string,
  valueId: string,
  metaId: string,
  metaText: string,
): string {
  return `<article class="phantasyMonitoringCard"><p class="phantasyMonitoringCardLabel">${label}</p><div id="${valueId}" class="phantasyMonitoringCardValue">--</div><div id="${metaId}" class="phantasyMonitoringCardMeta">${metaText}</div></article>`;
}

function setText(target: Element | null, value: string): void {
  if (target) {
    target.textContent = value;
  }
}

function formatDuration(ms: number | undefined): string {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatNumber(value: number | undefined, digits = 0): string {
  return Number(value || 0).toFixed(digits);
}

async function fetchWidget<T>(
  basePath: string,
  requestPath: string,
): Promise<MonitoringWidgetResponse<T>> {
  const response = await fetch(`${basePath}${requestPath}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<MonitoringWidgetResponse<T>>;
}

function renderRecent(
  list: HTMLUListElement | null,
  items: RecentItem[] | undefined,
): void {
  if (!list) {
    return;
  }

  list.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "phantasyMonitoringItemMeta";
    empty.textContent = "No recent activity available.";
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("li");
    row.className = "phantasyMonitoringItem";

    const type = document.createElement("div");
    type.className = "phantasyMonitoringItemType";
    type.textContent = item.type || "activity";
    row.appendChild(type);

    const meta = document.createElement("div");
    meta.className = "phantasyMonitoringItemMeta";
    const when = item.when ? new Date(item.when).toLocaleString() : "Unknown time";
    meta.textContent = `${item.details || "No details"} | ${when}`;
    row.appendChild(meta);

    list.appendChild(row);
  });
}

function renderIntegrations(
  list: HTMLUListElement | null,
  integrations: string[] | undefined,
): void {
  if (!list) {
    return;
  }

  list.innerHTML = "";
  if (!Array.isArray(integrations) || integrations.length === 0) {
    const empty = document.createElement("li");
    empty.className = "phantasyMonitoringItemMeta";
    empty.textContent = "No active integrations detected.";
    list.appendChild(empty);
    return;
  }

  integrations.forEach((integration) => {
    const row = document.createElement("li");
    row.className = "phantasyMonitoringItem";

    const label = document.createElement("div");
    label.className = "phantasyMonitoringItemType phantasyMonitoringGood";
    label.textContent = String(integration);
    row.appendChild(label);

    const meta = document.createElement("div");
    meta.className = "phantasyMonitoringItemMeta";
    meta.textContent = "Live integration currently reporting activity.";
    row.appendChild(meta);

    list.appendChild(row);
  });
}

function mountMonitoringSurface(
  root: HTMLElement,
  context: PluginAdminNativeMountContext,
): () => void {
  const doc = root.ownerDocument || document;
  ensureStyles(doc);
  root.className = "phantasyMonitoringRoot";
  root.innerHTML = [
    '<main class="phantasyMonitoringMain">',
    '<section class="phantasyMonitoringHero">',
    "<div>",
    '<p class="phantasyMonitoringEyebrow">Plugin native surface</p>',
    '<h1 class="phantasyMonitoringTitle">Monitoring</h1>',
    '<p class="phantasyMonitoringLead">This dashboard is mounted directly into the host tab by the monitoring plugin. It is not an external website embed.</p>',
    "</div>",
    '<div class="phantasyMonitoringActions"><button type="button" class="phantasyMonitoringButton" data-refresh>Refresh</button></div>',
    "</section>",
    '<div class="phantasyMonitoringStatus" data-status>Loading metrics...</div>',
    '<section class="phantasyMonitoringGrid">',
    createCardMarkup("Uptime", "uptimeValue", "uptimeMeta", "Waiting for plugin data"),
    createCardMarkup("Requests / Minute", "rpmValue", "rpmMeta", "Current request load"),
    createCardMarkup("CPU Load", "cpuValue", "cpuMeta", "Per-core normalized"),
    createCardMarkup("Memory", "memoryValue", "memoryMeta", "RSS and heap usage"),
    createCardMarkup("WebSockets", "websocketValue", "websocketMeta", "Active live connections"),
    createCardMarkup("Integrations", "integrationValue", "integrationMeta", "Connected channels"),
    "</section>",
    '<section class="phantasyMonitoringColumns">',
    '<article class="phantasyMonitoringPanel"><h2 class="phantasyMonitoringPanelTitle">Recent Activity</h2><ul class="phantasyMonitoringList" data-recent></ul></article>',
    '<article class="phantasyMonitoringPanel"><h2 class="phantasyMonitoringPanelTitle">Active Integrations</h2><ul class="phantasyMonitoringList" data-integrations></ul></article>',
    "</section>",
    "</main>",
  ].join("");

  const statusEl = root.querySelector("[data-status]");
  const refreshButton = root.querySelector<HTMLButtonElement>("[data-refresh]");
  const recentList = root.querySelector<HTMLUListElement>("[data-recent]");
  const integrationList =
    root.querySelector<HTMLUListElement>("[data-integrations]");
  let disposed = false;
  let intervalHandle: number | undefined;

  async function loadSurface(): Promise<void> {
    setText(statusEl, "Refreshing plugin metrics...");
    try {
      const basePath = context.pluginBasePath || "";
      const [uptime, cpu, memory, recent, integrations, websockets, rpm] =
        await Promise.all([
          fetchWidget<{ uptimeMs?: number; rpm?: number }>(basePath, "/widgets/uptime"),
          fetchWidget<{ cpuPercent?: number; load1?: number; cores?: number }>(
            basePath,
            "/widgets/cpu",
          ),
          fetchWidget<{
            rssMB?: number;
            heapMB?: number;
            memoryPercent?: number;
          }>(basePath, "/widgets/memory"),
          fetchWidget<{ items?: RecentItem[] }>(basePath, "/widgets/recent"),
          fetchWidget<{ integrations?: string[] }>(
            basePath,
            "/widgets/integrations",
          ),
          fetchWidget<{ count?: number }>(basePath, "/widgets/websockets"),
          fetchWidget<{ rpm?: number }>(basePath, "/widgets/rpm"),
        ]);

      if (disposed) {
        return;
      }

      setText(
        root.querySelector("#uptimeValue"),
        formatDuration(uptime.data?.uptimeMs),
      );
      setText(
        root.querySelector("#uptimeMeta"),
        `RPM ${formatNumber(uptime.data?.rpm, 0)}`,
      );
      setText(root.querySelector("#rpmValue"), formatNumber(rpm.data?.rpm, 0));
      setText(
        root.querySelector("#cpuValue"),
        `${formatNumber(cpu.data?.cpuPercent, 1)}%`,
      );
      setText(
        root.querySelector("#cpuMeta"),
        `Load ${formatNumber(cpu.data?.load1, 2)} across ${formatNumber(cpu.data?.cores, 0)} cores`,
      );
      setText(
        root.querySelector("#memoryValue"),
        `${formatNumber(memory.data?.rssMB, 0)} MB`,
      );
      setText(
        root.querySelector("#memoryMeta"),
        `Heap ${formatNumber(memory.data?.heapMB, 0)} MB | ${formatNumber(memory.data?.memoryPercent, 1)}% host RAM`,
      );
      setText(
        root.querySelector("#websocketValue"),
        formatNumber(websockets.data?.count, 0),
      );

      const activeIntegrations = integrations.data?.integrations || [];
      setText(
        root.querySelector("#integrationValue"),
        formatNumber(activeIntegrations.length, 0),
      );
      setText(
        root.querySelector("#integrationMeta"),
        activeIntegrations.join(", ") || "No active integrations",
      );

      renderRecent(recentList, recent.data?.items);
      renderIntegrations(integrationList, activeIntegrations);
      setText(
        statusEl,
        `Plugin surface live. Last refresh ${new Date().toLocaleTimeString()}`,
      );
    } catch (error) {
      if (!disposed) {
        setText(
          statusEl,
          error instanceof Error
            ? error.message
            : "Failed to load monitoring surface",
        );
      }
    }
  }

  function handleRefresh(): void {
    void loadSurface();
  }

  refreshButton?.addEventListener("click", handleRefresh);
  void loadSurface();
  intervalHandle = window.setInterval(() => {
    void loadSurface();
  }, 15_000);

  return () => {
    disposed = true;
    if (intervalHandle) {
      window.clearInterval(intervalHandle);
    }
    refreshButton?.removeEventListener("click", handleRefresh);
    root.innerHTML = "";
    root.className = "";
  };
}

registerPluginAdminSurface("monitoring", {
  mount(root, context) {
    return mountMonitoringSurface(root, context);
  },
});
