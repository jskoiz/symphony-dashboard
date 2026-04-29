export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function compactNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

export function fullNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US").format(value);
}

export function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export function elapsedSince(isoTime) {
  if (!isoTime) return "n/a";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoTime).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m ${seconds % 60}s`;
}

export function relativeTime(isoTime) {
  if (!isoTime) return "n/a";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoTime).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export function statusClass(status) {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("review")) return "review";
  if (normalized.includes("progress") || normalized.includes("running")) return "active";
  if (normalized.includes("done") || normalized.includes("complete")) return "done";
  return "neutral";
}

export function parseMetric(html, label) {
  const pattern = new RegExp(`<p class="metric-label">${label}</p>\\s*<p class="metric-value numeric">([^<]+)</p>`);
  const match = html.match(pattern);
  return match ? Number(match[1].replaceAll(",", "").trim()) : 0;
}

export function parseIssueIds(html) {
  return [...html.matchAll(/<span class="issue-id">([^<]+)<\/span>/g)].map((match) => match[1]);
}

export async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export async function loadProject(project, issueCache = {}) {
  if (project.sample) {
    return loadSampleProject(project);
  }

  try {
    const html = await fetchText(`${project.url}/`);
    const issueIds = parseIssueIds(html);
    const sessions = await Promise.all(issueIds.map(async (issueId) => {
      const details = await fetchJson(`${project.url}/api/v1/${issueId}`);
      const running = details.running || {};
      const issue = issueCache[issueId] || {};
      return {
        issueId,
        title: issue.title || issueId,
        linearStatus: issue.status || running.state || details.status || "Unknown",
        project: issue.project || project.name,
        url: issue.url || `${project.url}/api/v1/${issueId}`,
        remaining: issue.remaining || running.last_message || "Open the source tracker for remaining acceptance criteria.",
        runtime: running.started_at ? elapsedSince(running.started_at) : "n/a",
        turns: running.turn_count || 0,
        state: running.state || details.status || "Unknown",
        lastMessage: running.last_message || "No recent event",
        lastEventAt: running.last_event_at || null,
        tokens: running.tokens || { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
      };
    }));

    return {
      ...project,
      online: true,
      running: parseMetric(html, "Running"),
      retrying: parseMetric(html, "Retrying"),
      totalTokens: parseMetric(html, "Total tokens"),
      sessions,
      error: null,
    };
  } catch (error) {
    return {
      ...project,
      online: false,
      running: 0,
      retrying: 0,
      totalTokens: 0,
      sessions: [],
      error: error.message,
    };
  }
}

function loadSampleProject(project) {
  const sample = project.sample || {};
  const sessions = (sample.sessions || []).map((session) => ({
    issueId: session.issueId,
    title: session.title || session.issueId,
    linearStatus: session.linearStatus || session.state || "In Progress",
    project: session.project || project.name,
    url: session.url || `${project.url}/api/v1/${session.issueId}`,
    remaining: session.remaining || session.lastMessage || "Sample work item.",
    runtime: session.runtime || "0m 00s",
    turns: session.turns || 0,
    state: session.state || session.linearStatus || "In Progress",
    lastMessage: session.lastMessage || "Sample event",
    lastEventAt: session.lastEventAt || new Date().toISOString(),
    tokens: session.tokens || { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
  }));

  return {
    ...project,
    online: sample.online ?? true,
    running: sample.running ?? sessions.filter((session) => statusClass(session.state) === "active").length,
    retrying: sample.retrying ?? sessions.filter((session) => String(session.state).toLowerCase().includes("retry")).length,
    totalTokens: sample.totalTokens ?? sessions.reduce((sum, session) => sum + (session.tokens.total_tokens || 0), 0),
    sessions,
    error: null,
  };
}
