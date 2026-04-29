#!/usr/bin/env node
import http from "node:http";
import { loadConfig } from "./config.mjs";
import {
  compactNumber,
  escapeHtml,
  fullNumber,
  loadProject,
  percent,
  relativeTime,
  statusClass,
} from "./lib.mjs";

const PORT = Number(process.env.SYMPHONY_DASHBOARD_PORT || process.env.SYMPHONY_HUB_PORT || 4050);

async function renderDashboard() {
  const config = await loadConfig();
  const refreshSeconds = Number(config.dashboard.refreshSeconds || 30);
  const snapshots = await Promise.all(config.projects.map((project) => loadProject(project, config.issues)));
  const sessions = snapshots.flatMap((project) => (
    project.sessions.map((session) => ({ ...session, runtimeName: project.name, projectUrl: project.url }))
  ));
  const totalInput = sessions.reduce((sum, session) => sum + (session.tokens.input_tokens || 0), 0);
  const totalOutput = sessions.reduce((sum, session) => sum + (session.tokens.output_tokens || 0), 0);
  const totals = {
    projects: snapshots.filter((project) => project.online).length,
    running: snapshots.reduce((sum, project) => sum + project.running, 0),
    retrying: snapshots.reduce((sum, project) => sum + project.retrying, 0),
    tokens: snapshots.reduce((sum, project) => sum + project.totalTokens, 0),
    inputTokens: totalInput,
    outputTokens: totalOutput,
    inReview: sessions.filter((session) => statusClass(session.linearStatus) === "review").length,
    avgTurns: sessions.length ? Math.round(sessions.reduce((sum, session) => sum + session.turns, 0) / sessions.length) : 0,
  };
  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.lastEventAt || 0) - new Date(a.lastEventAt || 0))
    .slice(0, 8);
  const allNominal = snapshots.every((project) => project.online) && totals.retrying === 0;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="${escapeHtml(refreshSeconds)}">
  <title>${escapeHtml(config.dashboard.title)}</title>
  <style>
    :root { color-scheme: dark; --bg:#050808; --panel:#071010; --text:#d8dedc; --muted:#87928f; --line:#263433; --line-strong:#3a4947; --accent:#3d8cff; --ok:#54d46a; --warn:#ffb22e; --bad:#ff5c4d; --idle:#8d9692; }
    * { box-sizing: border-box; }
    body { margin:0; background:radial-gradient(circle at 50% -20%, #0b1717, var(--bg) 35%); color:var(--text); font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; letter-spacing:0; }
    a { color:var(--accent); text-decoration:none; }
    header { position:sticky; top:0; z-index:5; border:1px solid var(--line); border-width:1px 0; background:rgba(5,8,8,.95); backdrop-filter:blur(10px); }
    .topbar { display:grid; grid-template-columns:auto auto auto minmax(170px,1fr) auto auto minmax(190px,240px); align-items:stretch; min-height:48px; overflow:hidden; }
    .brand,.top-cell,.actions a,.actions button { border-right:1px solid var(--line); display:flex; align-items:center; gap:10px; padding:0 14px; white-space:nowrap; }
    .brand { font-size:18px; font-weight:800; color:#f1f4f1; letter-spacing:.04em; }
    .top-label,.muted { color:var(--muted); }
    .env { border:1px solid #1d6a38; color:var(--ok); padding:2px 7px; }
    .ok { color:var(--ok); } .warn { color:var(--warn); } .bad { color:var(--bad); } .blue { color:var(--accent); } .orange { color:var(--warn); }
    .actions { display:flex; }
    .actions a,.actions button { min-height:48px; border:0; border-right:1px solid var(--line); background:transparent; color:var(--text); cursor:pointer; font:inherit; }
    .actions a.primary { color:var(--accent); }
    main { padding:12px; }
    .metrics { display:grid; grid-template-columns:1.05fr .95fr 1fr 1fr 1.05fr 1.35fr .95fr .9fr; gap:0; border:1px solid var(--line-strong); margin-bottom:12px; min-width:0; }
    .metric { min-height:68px; border-right:1px solid var(--line-strong); background:rgba(7,16,16,.9); padding:10px 14px; }
    .metric:last-child { border-right:0; }
    .metric-label { color:#aab2ae; font-size:11px; text-transform:uppercase; }
    .metric-value { margin-top:6px; font-size:20px; color:#f2f4f2; font-variant-numeric:tabular-nums; }
    .layout { display:grid; grid-template-columns:335px minmax(0,1fr) 285px; gap:10px; align-items:start; min-width:0; }
    .panel { border:1px solid var(--line-strong); background:linear-gradient(180deg,rgba(8,18,18,.96),rgba(5,12,12,.96)); min-width:0; }
    .panel-head { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); min-height:48px; padding:0 12px; }
    .panel-title { color:#f3f5f3; font-weight:800; text-transform:uppercase; }
    .panel-count { color:var(--muted); margin-left:8px; font-weight:500; text-transform:none; }
    .project-table-head,.project-row,.health-row,.activity-row,.attention-row { display:grid; align-items:center; border-bottom:1px solid var(--line); }
    .project-table-head { grid-template-columns:minmax(0,1fr) 124px; min-height:42px; padding:0 14px; color:var(--muted); text-transform:uppercase; font-size:11px; font-weight:800; background:rgba(10,20,20,.62); }
    .project-table-head span:last-child { display:grid; grid-template-columns:repeat(3,1fr); text-align:center; }
    .project-row { grid-template-columns:minmax(0,1fr) 124px; gap:10px; align-items:start; min-height:104px; padding:14px; }
    .project-row:not(:last-child) { border-bottom-color:var(--line-strong); }
    .project-main { min-width:0; }
    .project-name { display:flex; align-items:center; gap:8px; color:#f4f6f4; font-size:17px; font-weight:800; line-height:1.2; }
    .dot { display:inline-block; width:9px; height:9px; border-radius:50%; background:currentColor; margin-right:5px; }
    .project-metrics { display:grid; grid-template-columns:repeat(3,1fr); align-items:center; align-self:start; min-height:21px; text-align:center; }
    .project-metric { display:block; }
    .project-metric .num { font-size:16px; font-weight:800; }
    .project-metric-label { display:none; }
    .project-meta { display:flex; align-items:center; gap:9px; margin-top:14px; min-width:0; color:var(--muted); font-size:12px; }
    .path { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .branch { flex:0 0 auto; color:#aab2ae; white-space:nowrap; }
    .branch::before { content:"⎇"; margin-right:5px; color:#8c9893; font-size:13px; }
    .num { font-variant-numeric:tabular-nums; white-space:nowrap; }
    .work-panel { overflow:auto; }
    .tabs { display:flex; align-items:center; gap:0; border-bottom:1px solid var(--line); }
    .tab { border-right:1px solid var(--line); padding:8px 12px; color:var(--muted); text-transform:uppercase; }
    .tab.active { color:var(--accent); background:#0a1824; }
    .queue-tools { margin-left:auto; display:flex; color:var(--muted); }
    .queue-tools span { border-left:1px solid var(--line); padding:8px 12px; }
    table { width:100%; min-width:930px; border-collapse:collapse; table-layout:fixed; }
    th,td { border-right:1px solid var(--line); border-bottom:1px solid var(--line); padding:9px 10px; text-align:left; vertical-align:top; }
    th { color:var(--muted); font-size:11px; font-weight:750; text-transform:uppercase; background:rgba(12,22,22,.88); }
    tr:last-child td { border-bottom:0; } td:last-child,th:last-child { border-right:0; }
    .issue-id { color:var(--accent); font-weight:780; }
    .title { display:block; color:#dfe5e2; margin-top:3px; }
    .subline { display:block; color:var(--muted); margin-top:3px; font-size:11px; }
    .status { display:inline-flex; padding:2px 7px; color:var(--accent); background:#0b2440; text-transform:uppercase; font-size:11px; font-weight:800; }
    .status.review { color:var(--warn); background:#2a2108; } .status.done { color:var(--ok); background:#0d2516; } .status.neutral { color:var(--idle); background:#202626; }
    .event { color:#cfd7d3; }
    .right-col { display:grid; gap:8px; }
    .right-col .panel-head { min-height:40px; padding:0 12px; }
    .health-row { grid-template-columns:1fr 54px 42px 42px; min-height:32px; padding:0 12px; }
    .health-head { color:var(--muted); text-transform:uppercase; font-size:11px; }
    .bar-row { display:grid; grid-template-columns:88px 1fr 62px 44px; align-items:center; gap:8px; min-height:34px; padding:5px 12px; }
    .bar-track { height:9px; border:1px solid var(--line); background:#101717; }
    .bar-fill { height:100%; background:linear-gradient(90deg,#326dff,#65a0ff); }
    .activity-row { grid-template-columns:46px 70px minmax(0,1fr); gap:8px; align-items:start; min-height:34px; padding:5px 12px; }
    .activity-row a { font-weight:800; white-space:nowrap; }
    .activity-row span:last-child { color:#cfd7d3; line-height:1.35; }
    .attention-row { grid-template-columns:18px 1fr; min-height:34px; padding:0 12px; }
    .footer { display:grid; grid-template-columns:1fr 360px 205px; border:1px solid var(--line); border-top:0; min-height:36px; align-items:center; color:var(--muted); }
    .footer > div { padding:0 12px; border-right:1px solid var(--line); } .footer > div:last-child { border-right:0; }
    .empty { padding:24px; color:var(--muted); text-align:center; }
    @media (max-width:1800px) {
      .topbar { grid-template-columns:auto auto minmax(230px,1fr) auto auto; }
      .topbar .top-cell:nth-child(4), .topbar .top-cell:nth-child(7) { display:none; }
      .metrics { grid-template-columns:repeat(8,minmax(0,1fr)); }
      .metric { padding:10px 12px; }
      .metric-value { font-size:18px; }
      .layout { grid-template-columns:335px minmax(0,1fr); }
      .right-col { grid-column:1 / -1; grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr); align-items:start; }
      .bar-row { grid-template-columns:78px 1fr 54px 38px; }
      table { min-width:860px; }
    }
    @media (max-width:1250px) {
      main { padding:10px; }
      .topbar { grid-template-columns:1fr auto auto; }
      .brand { grid-column:1 / -1; min-height:42px; }
      .top-cell:nth-child(2), .top-cell:nth-child(3), .top-cell:nth-child(5) { min-height:34px; }
      .actions { display:contents; }
      .actions a, .actions button { min-height:34px; }
      .metrics { grid-template-columns:repeat(4,minmax(0,1fr)); }
      .layout { grid-template-columns:1fr; }
      .project-table-head { grid-template-columns:minmax(0,1fr) 124px; padding:0 14px; }
      .project-row { grid-template-columns:minmax(0,1fr) 124px; min-height:104px; padding:14px; }
      .project-name { font-size:17px; }
      .right-col { grid-column:auto; grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr); align-items:start; }
      .work-panel { order:2; }
    }
    @media (max-width:760px) {
      .topbar, .metrics, .right-col, .footer { grid-template-columns:1fr; }
      .brand, .top-cell, .actions a, .actions button, .metric, .footer > div { border-right:0; border-bottom:1px solid var(--line); }
      .project-table-head, .project-row { grid-template-columns:1fr 38px 38px 64px; }
      .metric { min-height:64px; }
      .work-panel { max-width:100%; }
      table { min-width:820px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="topbar">
      <div class="brand">${escapeHtml(config.dashboard.title).toUpperCase()}</div>
      <div class="top-cell"><span class="top-label">ENV</span><span class="env">LOCAL</span></div>
      <div class="top-cell"><span class="top-label">STATUS</span><span class="${allNominal ? "ok" : "warn"}">${allNominal ? "ALL SYSTEMS NOMINAL" : "CHECK INSTANCES"}</span></div>
      <div class="top-cell"><span class="top-label">LAST SYNC</span><span>${escapeHtml(new Date().toLocaleTimeString())}</span></div>
      <div class="top-cell"><span class="ok">●</span><span>AUTO-REFRESH ON (${escapeHtml(refreshSeconds)}s)</span></div>
      <div class="actions"><button type="button" onclick="location.reload()">REFRESH</button><a class="primary" href="${escapeHtml(config.dashboard.linearUrl)}" target="_blank" rel="noreferrer">OPEN TRACKER</a></div>
      <div class="top-cell"><span class="top-label">DATA</span><span>${escapeHtml(sessions.length)} work items</span></div>
    </div>
  </header>
  <main>
    <section class="metrics" aria-label="Summary metrics">
      <div class="metric"><div class="metric-label">Online Projects</div><div class="metric-value ok">${totals.projects} / ${config.projects.length}</div></div>
      <div class="metric"><div class="metric-label">Active Sessions</div><div class="metric-value blue">${totals.running}</div></div>
      <div class="metric"><div class="metric-label">In Review</div><div class="metric-value warn">${totals.inReview}</div></div>
      <div class="metric"><div class="metric-label">Retrying</div><div class="metric-value bad">${totals.retrying}</div></div>
      <div class="metric"><div class="metric-label">Total Tokens</div><div class="metric-value">${compactNumber(totals.tokens)}</div></div>
      <div class="metric"><div class="metric-label">Tokens In / Out</div><div class="metric-value">${compactNumber(totals.inputTokens)} / ${compactNumber(totals.outputTokens)}</div></div>
      <div class="metric"><div class="metric-label">Tokens / Min</div><div class="metric-value">${compactNumber(Math.round(totals.tokens / 18))}</div></div>
      <div class="metric"><div class="metric-label">Avg Turns</div><div class="metric-value">${totals.avgTurns}</div></div>
    </section>

    <section class="layout">
      <aside class="panel">
        <div class="panel-head"><span class="panel-title">Project Instances</span><span class="ok">${totals.projects} ONLINE</span></div>
        <div class="project-table-head"><span>Project</span><span><span>Run</span><span>Rev</span><span>Tokens</span></span></div>
        ${snapshots.map(renderProjectCard).join("")}
      </aside>
      <section class="panel work-panel">
        <div class="panel-head"><span class="panel-title">Work Queue <span class="panel-count">${sessions.length} items</span></span></div>
        <div class="tabs"><span class="tab active">All ${sessions.length}</span><span class="tab">Active ${totals.running}</span><span class="tab warn">In Review ${totals.inReview}</span><span class="tab bad">Retrying ${totals.retrying}</span><span class="tab">Idle 0</span><div class="queue-tools"><span>Group: None</span><span>Sort: Updated</span><span>DESC</span></div></div>
        ${sessions.length ? renderWorkTable(sessions) : `<div class="empty">No active sessions found.</div>`}
      </section>
      <aside class="right-col">
        ${renderTokenPanel(snapshots, totals.tokens)}
        ${renderActivityPanel(recentSessions)}
        ${renderAttentionPanel(totals)}
      </aside>
    </section>
    <section class="footer">
      <div>Refresh the page to poll all configured Symphony instances.</div>
      <div><span class="${allNominal ? "ok" : "warn"}">● ${allNominal ? "SYNC OK" : "SYNC DEGRADED"}</span> &nbsp;&nbsp;&nbsp; ● AUTO-REFRESH ON (${escapeHtml(refreshSeconds)}s)</div>
      <div>DATA AGE 0s</div>
    </section>
  </main>
</body>
</html>`;
}

function renderProjectCard(project) {
  const reviewCount = project.sessions.filter((session) => statusClass(session.linearStatus) === "review").length;
  const workflowPath = project.workflow ? project.workflow.replace("/WORKFLOW.md", "") : project.url;
  return `<div class="project-row">
    <div class="project-main">
      <a class="project-name" href="${escapeHtml(project.url)}" target="_blank" rel="noreferrer"><span class="${project.online ? "ok" : "bad"}"><span class="dot"></span></span>${escapeHtml(project.name)}</a>
      <div class="project-meta"><span class="path" title="${escapeHtml(workflowPath)}">${escapeHtml(workflowPath)}</span><span class="branch">${escapeHtml(project.branch || "main")}${project.error ? ` <span class="bad">${escapeHtml(project.error)}</span>` : ""}</span></div>
    </div>
    <div class="project-metrics">
      <div class="project-metric"><span class="num blue">${project.running}</span><span class="project-metric-label">Run</span></div>
      <div class="project-metric"><span class="num orange">${reviewCount}</span><span class="project-metric-label">Rev</span></div>
      <div class="project-metric"><span class="num">${compactNumber(project.totalTokens)}</span><span class="project-metric-label">Tokens</span></div>
    </div>
  </div>`;
}

function renderWorkTable(sessions) {
  return `<table>
    <colgroup><col style="width:76px"><col style="width:23%"><col style="width:12%"><col style="width:100px"><col style="width:76px"><col><col style="width:58px"><col style="width:122px"></colgroup>
    <thead><tr><th>ID</th><th>Title</th><th>Project</th><th>State</th><th>Runtime</th><th>Latest Update</th><th>Turns</th><th>Tokens</th></tr></thead>
    <tbody>
      ${sessions.map((session) => `<tr>
        <td><a class="issue-id" href="${escapeHtml(session.url)}" target="_blank" rel="noreferrer">${escapeHtml(session.issueId)}</a></td>
        <td><span class="title">${escapeHtml(session.title)}</span></td>
        <td>${escapeHtml(session.runtimeName)}<span class="subline">${escapeHtml(session.project)}</span></td>
        <td><span class="status ${statusClass(session.linearStatus)}">${escapeHtml(session.linearStatus)}</span></td>
        <td class="num">${escapeHtml(session.runtime)}<span class="subline">${escapeHtml(session.turns)} turns</span></td>
        <td class="event">${escapeHtml(session.remaining)}<span class="subline">${escapeHtml(relativeTime(session.lastEventAt))}</span></td>
        <td class="num">${escapeHtml(session.turns)}</td>
        <td class="num">${fullNumber(session.tokens.total_tokens || 0)}<span class="subline">${compactNumber(session.tokens.input_tokens || 0)} / ${compactNumber(session.tokens.output_tokens || 0)}</span></td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function renderTokenPanel(snapshots, totalTokens) {
  return `<section class="panel">
    <div class="panel-head"><span class="panel-title">Token Usage By Project</span><span class="muted">TOTAL ${compactNumber(totalTokens)}</span></div>
    <div class="bar-row muted"><span>Project</span><span></span><span>Tokens</span><span>%</span></div>
    ${[...snapshots].sort((a, b) => b.totalTokens - a.totalTokens).map((project) => {
      const share = percent(project.totalTokens, totalTokens);
      return `<div class="bar-row"><span>${escapeHtml(project.name)}</span><span class="bar-track"><span class="bar-fill" style="display:block;width:${share}%"></span></span><span class="num">${compactNumber(project.totalTokens)}</span><span class="num">${share}%</span></div>`;
    }).join("")}
  </section>`;
}

function renderActivityPanel(sessions) {
  return `<section class="panel">
    <div class="panel-head"><span class="panel-title">Recent Activity</span></div>
    ${sessions.length ? sessions.map((session) => `<div class="activity-row"><span class="muted">${escapeHtml(relativeTime(session.lastEventAt).replace(" ago", ""))}</span><a href="${escapeHtml(session.url)}" target="_blank" rel="noreferrer">${escapeHtml(session.issueId)}</a><span>${escapeHtml(session.lastMessage)}</span></div>`).join("") : `<div class="empty">No recent activity.</div>`}
  </section>`;
}

function renderAttentionPanel(totals) {
  return `<section class="panel">
    <div class="panel-head"><span class="panel-title bad">Attention Needed</span></div>
    <div class="attention-row"><span class="${totals.retrying ? "bad" : "ok"}">◎</span><span>${totals.retrying ? `${totals.retrying} retrying tasks` : "No retrying tasks"}</span></div>
    <div class="attention-row"><span class="ok">◎</span><span>No failing instances detected by the rollup</span></div>
  </section>`;
}

const server = http.createServer(async (_request, response) => {
  try {
    const html = await renderDashboard();
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(html);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.stack || error.message);
  }
});

server.listen(PORT, () => {
  console.log(`Symphony dashboard: http://127.0.0.1:${PORT}`);
});
