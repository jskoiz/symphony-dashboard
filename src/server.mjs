#!/usr/bin/env node
import http from "node:http";
import { loadConfig } from "./config.mjs";
import {
  compactNumber,
  escapeHtml,
  fullNumber,
  loadProject,
  relativeTime,
  statusClass,
} from "./lib.mjs";

const PORT = Number(process.env.SYMPHONY_DASHBOARD_PORT || process.env.SYMPHONY_HUB_PORT || 4050);

const sparkSamples = {
  active: [3, 4, 5, 5, 4, 6, 5, 5, 6, 6, 5, 6],
  review: [1, 2, 2, 1, 2, 3, 2, 3, 3, 3, 3, 3],
  retrying: [0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1],
  tokens: [50, 52, 54, 58, 62, 68, 75, 82, 90, 98, 108, 118],
  rate: [4, 5, 6, 5, 7, 8, 7, 9, 10, 9, 11, 10],
};

export async function renderDashboard() {
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
    inReview: sessions.filter((session) => pillClass(session.linearStatus) === "review").length,
    done: sessions.filter((session) => pillClass(session.linearStatus) === "done").length,
    idle: sessions.filter((session) => pillClass(session.linearStatus) === "neutral").length,
    avgTurns: sessions.length ? Math.round(sessions.reduce((sum, session) => sum + session.turns, 0) / sessions.length) : 0,
  };
  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.lastEventAt || 0) - new Date(a.lastEventAt || 0))
    .slice(0, 10);
  const allNominal = snapshots.every((project) => project.online) && totals.retrying === 0;
  const lastSync = new Date().toLocaleTimeString();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="${escapeHtml(refreshSeconds)}">
  <title>${escapeHtml(config.dashboard.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* Tokens */
    :root {
      color-scheme: dark;
      --bg:#06090a; --bg-elev:#0b1112; --bg-elev-2:#0e1517; --panel:#0a1011;
      --row-hover:#0f1719; --row-active:#0c1a26;
      --text:#e7ecea; --text-strong:#f6f8f7; --text-muted:#8a948f; --text-faint:#5e6864;
      --line:#1a2123; --line-strong:#232b2d;
      --accent:#4a91ff; --accent-soft:rgba(74,145,255,.12); --accent-strong:#6aa7ff;
      --ok:#5fd47a; --ok-soft:rgba(95,212,122,.12);
      --warn:#ffb547; --warn-soft:rgba(255,181,71,.12);
      --bad:#ff6b5c; --bad-soft:rgba(255,107,92,.12);
      --idle:#7a847f; --idle-soft:rgba(122,132,127,.12);
      --font-sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
      --font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
      --s-1:4px; --s-2:8px; --s-3:12px; --s-4:20px; --head-h:38px;
    }
    body[data-theme="light"] {
      color-scheme: light;
      --bg:#f6f6f3; --bg-elev:#ffffff; --bg-elev-2:#fafaf7; --panel:#ffffff;
      --row-hover:#f1f2ee; --row-active:#e6efff;
      --text:#1c2120; --text-strong:#0a0e0d; --text-muted:#6b736f; --text-faint:#9aa19c;
      --line:#e4e4df; --line-strong:#d4d6cf;
      --accent:#1f6feb; --accent-soft:rgba(31,111,235,.10); --accent-strong:#1559c4;
      --ok:#1e9c4a; --ok-soft:rgba(30,156,74,.10);
      --warn:#b3700d; --warn-soft:rgba(179,112,13,.10);
      --bad:#d23f30; --bad-soft:rgba(210,63,48,.10);
      --idle:#7a847f; --idle-soft:rgba(122,132,127,.10);
    }
    * { box-sizing:border-box; border-radius:0; }
    html, body { margin:0; padding:0; }
    body {
      background:var(--bg); color:var(--text); font:13px/1.45 var(--font-sans);
      -webkit-font-smoothing:antialiased; font-feature-settings:"ss01","cv11";
    }
    a { color:var(--accent); text-decoration:none; }
    button { font:inherit; color:inherit; background:transparent; border:0; cursor:pointer; }
    .mono, .num, .metric-value, .issue-id, .pill, .pcell, .meta-value, .activity-time, .activity-id, .drawer-id, .drawer-grid .label, .drawer-grid .value {
      font-family:var(--font-mono); font-variant-numeric:tabular-nums;
    }
    .num { white-space:nowrap; text-align:right; }
    .ok { color:var(--ok); } .warn { color:var(--warn); } .bad { color:var(--bad); } .accent { color:var(--accent); }

    /* Layout */
    .header { position:sticky; top:0; z-index:10; background:color-mix(in oklab,var(--bg) 92%,transparent); backdrop-filter:blur(10px); border-bottom:1px solid var(--line); }
    .header-inner { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:var(--s-4); height:52px; padding:0 var(--s-4); }
    .brand { display:flex; align-items:center; gap:10px; font-family:var(--font-mono); font-size:13px; font-weight:700; letter-spacing:.08em; color:var(--text-strong); text-transform:uppercase; white-space:nowrap; }
    .brand-mark { width:22px; height:22px; border:1.5px solid var(--accent); position:relative; flex:0 0 auto; }
    .brand-mark::before, .brand-mark::after { content:""; position:absolute; background:var(--accent); }
    .brand-mark::before { left:4px; right:4px; top:50%; height:1.5px; transform:translateY(-50%); }
    .brand-mark::after { top:4px; bottom:4px; left:50%; width:1.5px; transform:translateX(-50%); }
    .brand-version { color:var(--text-muted); font-weight:400; letter-spacing:.04em; margin-left:4px; }
    .header-meta { display:flex; align-items:center; gap:var(--s-4); min-width:0; overflow:hidden; color:var(--text-muted); font-size:12px; }
    .meta-item { display:flex; align-items:center; gap:8px; white-space:nowrap; }
    .meta-label { font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-faint); }
    .meta-value { color:var(--text); font-size:12px; }
    .pulse { width:7px; height:7px; border-radius:50%; background:var(--ok); box-shadow:0 0 0 0 var(--ok); animation:pulse 2s ease-out infinite; }
    .pulse.bad { background:var(--bad); animation-name:pulse-bad; }
    @keyframes pulse { 0% { box-shadow:0 0 0 0 color-mix(in oklab,var(--ok) 60%,transparent); } 70% { box-shadow:0 0 0 6px transparent; } 100% { box-shadow:0 0 0 0 transparent; } }
    @keyframes pulse-bad { 0% { box-shadow:0 0 0 0 color-mix(in oklab,var(--bad) 60%,transparent); } 70% { box-shadow:0 0 0 6px transparent; } 100% { box-shadow:0 0 0 0 transparent; } }
    .header-actions { display:flex; align-items:center; gap:var(--s-2); }
    .btn { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 12px; border:1px solid var(--line-strong); background:var(--bg-elev); color:var(--text); font-size:12px; }
    .btn:hover { border-color:var(--accent); color:var(--text-strong); }
    .btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
    .toggle-theme { width:30px; padding:0; justify-content:center; }
    .icon { width:13px; height:13px; stroke:currentColor; stroke-width:1.6; fill:none; stroke-linecap:round; stroke-linejoin:round; }
    .kbd { padding:1px 5px; font-family:var(--font-mono); font-size:10.5px; color:var(--text-muted); border:1px solid var(--line-strong); background:var(--bg); }
    .system-bar { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:16px; padding:10px var(--s-4); border-bottom:1px solid var(--line); background:var(--bg-elev); }
    .system-bar.ok { background:linear-gradient(90deg,color-mix(in oklab,var(--ok) 8%,var(--bg-elev)) 0%,var(--bg-elev) 60%); }
    .system-bar.warn { background:linear-gradient(90deg,color-mix(in oklab,var(--warn) 10%,var(--bg-elev)) 0%,var(--bg-elev) 60%); }
    .system-status-label { display:flex; align-items:center; gap:10px; }
    .system-status-text { font-family:var(--font-mono); font-size:12.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
    .system-detail { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-muted); font-size:12px; }
    .system-counts { display:flex; align-items:center; gap:16px; color:var(--text-muted); font-size:11.5px; white-space:nowrap; }
    .system-counts strong { color:var(--text-strong); font-family:var(--font-mono); font-weight:600; margin-right:4px; }
    main { padding:var(--s-3) var(--s-4); display:flex; flex-direction:column; gap:var(--s-3); }
    .layout { display:grid; grid-template-columns:320px minmax(0,1fr); gap:var(--s-3); align-items:start; }
    .left-col { display:flex; flex-direction:column; gap:var(--s-3); min-width:0; }
    .panel { background:var(--panel); border:1px solid var(--line); overflow:hidden; min-width:0; }
    .panel-head { display:flex; align-items:center; justify-content:space-between; height:var(--head-h); padding:0 var(--s-3); border-bottom:1px solid var(--line); background:var(--bg-elev-2); }
    .panel-title { display:flex; align-items:baseline; gap:8px; font-family:var(--font-mono); font-size:11.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--text-strong); }
    .count { color:var(--text-muted); font-weight:400; letter-spacing:.04em; text-transform:none; }
    .panel-meta { font-family:var(--font-mono); font-size:11px; color:var(--text-muted); letter-spacing:.04em; text-transform:uppercase; }

    /* Components */
    .metrics { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); border:1px solid var(--line); background:var(--panel); overflow:hidden; }
    .metric { min-width:0; min-height:86px; padding:12px 14px; border-right:1px solid var(--line); display:flex; flex-direction:column; gap:6px; position:relative; }
    .metric:last-child { border-right:0; }
    .metric-label { font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-faint); }
    .metric-value { font-size:22px; font-weight:600; color:var(--text-strong); line-height:1.1; letter-spacing:-.01em; }
    .metric-value .denom { color:var(--text-faint); font-weight:400; font-size:14px; }
    .metric-value.tight { font-size:17px; white-space:nowrap; letter-spacing:-.02em; }
    .metric-sub { font-size:11px; color:var(--text-muted); margin-top:-2px; }
    .metric-spark { position:absolute; right:12px; bottom:10px; opacity:.35; }
    .metric-spark path { fill:none; stroke:currentColor; stroke-width:1.2; }
    .project-list-head { display:grid; grid-template-columns:1fr 38px 38px 60px; gap:8px; align-items:center; height:30px; padding:0 var(--s-3); border-bottom:1px solid var(--line); font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-faint); background:var(--bg-elev); }
    .project-list-head span:not(:first-child), .pcell { text-align:right; }
    .project-row { display:grid; grid-template-columns:1fr 38px 38px 60px; gap:8px; align-items:center; min-height:64px; padding:12px var(--s-3); border-bottom:1px solid var(--line); cursor:pointer; position:relative; }
    .project-row:last-child { border-bottom:0; }
    .project-row:hover { background:var(--row-hover); }
    .project-row.selected { background:var(--row-active); }
    .project-row.selected::before { content:""; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--accent); }
    .project-info { min-width:0; }
    .project-name { display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-strong); font-weight:600; font-size:13.5px; line-height:1.2; }
    .dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; background:var(--ok); }
    .project-row.offline .dot { background:var(--bad); }
    .project-meta { display:flex; align-items:center; gap:8px; margin-top:4px; min-width:0; color:var(--text-muted); font-size:11px; }
    .branch, .port { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .branch::before { content:"⎇"; margin-right:4px; color:var(--text-faint); }
    .pcell { font-size:12.5px; font-weight:500; color:var(--text-strong); }
    .pcell.zero { color:var(--text-faint); font-weight:400; }
    .pcell.run { color:var(--accent); } .pcell.rev { color:var(--warn); }
    .queue-tabs { display:flex; align-items:stretch; border-bottom:1px solid var(--line); background:var(--bg-elev); overflow-x:auto; scrollbar-width:none; }
    .queue-tabs::-webkit-scrollbar { display:none; }
    .qtab { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 14px; border-right:1px solid var(--line); color:var(--text-muted); font-size:11.5px; font-weight:500; white-space:nowrap; cursor:pointer; position:relative; }
    .qtab.active { color:var(--text-strong); background:var(--panel); }
    .qtab.active::after { content:""; position:absolute; left:0; right:0; bottom:-1px; height:2px; background:var(--accent); }
    .badge { font-family:var(--font-mono); font-size:10.5px; color:var(--text-muted); padding:1px 6px; background:var(--bg); border:1px solid var(--line-strong); line-height:1.4; }
    .qtab.review .badge { color:var(--warn); } .qtab.bad .badge { color:var(--bad); }
    .queue-tools { margin-left:auto; display:flex; align-items:stretch; color:var(--text-muted); font-size:11.5px; }
    .queue-tools span { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 12px; border-left:1px solid var(--line); white-space:nowrap; }
    .table-wrap { overflow-x:auto; min-width:0; }
    .queue-table { width:100%; min-width:780px; border-collapse:separate; border-spacing:0; table-layout:fixed; font-size:12.5px; }
    .queue-table th { text-align:left; height:32px; padding:8px 12px; border-bottom:1px solid var(--line); color:var(--text-faint); background:var(--bg-elev); font-size:10px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; }
    .queue-table th.right { text-align:right; }
    .queue-table td { padding:11px 12px; border-bottom:1px solid var(--line); vertical-align:top; line-height:1.4; }
    .queue-table tbody tr:last-child td { border-bottom:0; }
    .queue-table tbody tr { cursor:pointer; }
    .queue-table tbody tr:hover { background:var(--row-hover); }
    .queue-table tbody tr.hidden { display:none; }
    .issue-id { color:var(--accent); font-weight:600; font-size:12px; }
    .qcell-title, .qcell-sub, .qcell-project, .qcell-update { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
    .qcell-title { color:var(--text-strong); font-weight:500; }
    .qcell-sub { margin-top:2px; color:var(--text-muted); font-size:11px; }
    .qcell-project, .qcell-update { color:var(--text); }
    .pill { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; font-size:10.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; line-height:1.5; white-space:nowrap; }
    .pill-dot { width:5px; height:5px; border-radius:50%; background:currentColor; flex:0 0 auto; }
    .pill.active { color:var(--accent); background:var(--accent-soft); }
    .pill.review { color:var(--warn); background:var(--warn-soft); }
    .pill.done { color:var(--ok); background:var(--ok-soft); }
    .pill.bad { color:var(--bad); background:var(--bad-soft); }
    .pill.neutral { color:var(--idle); background:var(--idle-soft); }
    .attn-row { display:flex; align-items:center; gap:10px; padding:10px var(--s-3); border-bottom:1px solid var(--line); font-size:12.5px; }
    .attn-row:last-child { border-bottom:0; }
    .attn-icon { width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; font-size:11px; }
    .attn-icon.ok { background:var(--ok-soft); color:var(--ok); } .attn-icon.bad { background:var(--bad-soft); color:var(--bad); } .attn-icon.warn { background:var(--warn-soft); color:var(--warn); }
    .attn-text { color:var(--text); line-height:1.35; }
    .attn-text .muted { display:block; margin-top:2px; color:var(--text-muted); font-size:11px; }
    .activity-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .activity-grid > * { border-right:1px solid var(--line); }
    .activity-grid > *:nth-child(2n) { border-right:0; }
    .activity-row { display:grid; grid-template-columns:64px 70px minmax(0,1fr); gap:12px; align-items:baseline; padding:10px var(--s-3); border-bottom:1px solid var(--line); font-size:12px; }
    .activity-time { color:var(--text-faint); font-size:10.5px; text-transform:uppercase; white-space:nowrap; }
    .activity-id { color:var(--accent); font-size:11px; font-weight:600; white-space:nowrap; }
    .activity-msg { color:var(--text); line-height:1.4; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
    .footer { display:grid; grid-template-columns:1fr auto auto; gap:var(--s-4); align-items:center; padding:var(--s-3) var(--s-4); border-top:1px solid var(--line); color:var(--text-muted); font-family:var(--font-mono); font-size:11.5px; letter-spacing:.04em; }
    .empty { padding:32px; color:var(--text-muted); text-align:center; }
    .drawer-backdrop { position:fixed; inset:0; z-index:30; background:color-mix(in oklab,var(--bg) 60%,transparent); backdrop-filter:blur(2px); opacity:0; pointer-events:none; transition:opacity .18s; }
    .drawer-backdrop.open { opacity:1; pointer-events:auto; }
    .drawer { position:fixed; top:0; right:0; bottom:0; z-index:31; width:460px; max-width:90vw; background:var(--panel); border-left:1px solid var(--line-strong); transform:translateX(100%); transition:transform .22s cubic-bezier(.2,.8,.2,1); display:flex; flex-direction:column; }
    .drawer.open { transform:translateX(0); }
    .drawer-head { display:flex; align-items:center; justify-content:space-between; height:52px; padding:var(--s-3) 16px; border-bottom:1px solid var(--line); }
    .drawer-id { color:var(--accent); font-size:13px; font-weight:700; }
    .drawer-close { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; color:var(--text-muted); }
    .drawer-close:hover { background:var(--row-hover); color:var(--text); }
    .drawer-body { padding:16px; overflow-y:auto; flex:1; }
    .drawer-section { margin-bottom:var(--s-4); }
    .drawer-section h4 { margin:0 0 var(--s-2); font-family:var(--font-mono); font-size:10.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--text-faint); }
    .drawer-title { margin:0; color:var(--text-strong); font-size:18px; font-weight:600; line-height:1.3; }
    .drawer-prose { margin:0; color:var(--text); font-size:13px; line-height:1.55; }
    .drawer-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--line); border:1px solid var(--line); overflow:hidden; }
    .drawer-grid > div { padding:10px 12px; background:var(--panel); }
    .drawer-grid .label { color:var(--text-faint); font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
    .drawer-grid .value { margin-top:4px; color:var(--text-strong); font-size:13.5px; }
    @media (max-width:1500px) { .metric { padding:10px 12px; } .metric-value { font-size:19px; } .metric-spark { display:none; } }
    @media (max-width:1200px) { .layout { grid-template-columns:280px minmax(0,1fr); } }
    @media (max-width:1100px) { .metrics { grid-template-columns:repeat(4,1fr); } .metric:nth-child(4) { border-right:0; } .metric:nth-child(-n+4) { border-bottom:1px solid var(--line); } }
    @media (max-width:900px) {
      .header-inner { grid-template-columns:1fr auto; }
      .header-meta { display:none; }
      .system-bar { grid-template-columns:1fr; gap:var(--s-2); }
      .system-counts { flex-wrap:wrap; }
      .layout, .metrics, .activity-grid, .footer { grid-template-columns:1fr; }
      .metric, .activity-grid > * { border-right:0; }
      .metric:not(:last-child) { border-bottom:1px solid var(--line); }
      .queue-tools { display:none; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>SYMPHONY <span class="accent">CONTROL</span></span><span class="brand-version">v0.4</span></div>
      <div class="header-meta">
        <div class="meta-item"><span class="meta-label">Env</span><span class="meta-value ok">local</span></div>
        <div class="meta-item"><span class="meta-label">Last sync</span><span class="meta-value">${escapeHtml(lastSync)}</span></div>
        <div class="meta-item"><span class="pulse" aria-hidden="true"></span><span class="meta-label">Auto-refresh</span><span class="meta-value">${escapeHtml(refreshSeconds)}s</span></div>
        <div class="meta-item"><span class="meta-label">Items</span><span class="meta-value" id="visible-count">${escapeHtml(sessions.length)}</span></div>
      </div>
      <div class="header-actions">
        <button class="btn toggle-theme" type="button" id="theme-toggle" title="Toggle theme" aria-label="Toggle theme">${icon("sun")}</button>
        <button class="btn" type="button" id="refresh-button">${icon("refresh")}<span>Refresh</span><span class="kbd">R</span></button>
        <a class="btn primary" href="${escapeHtml(config.dashboard.linearUrl)}" target="_blank" rel="noreferrer">${icon("external")}<span>Open Tracker</span></a>
      </div>
    </div>
  </header>
  <div class="system-bar ${allNominal ? "ok" : "warn"}">
    <div class="system-status-label"><span class="pulse ${allNominal ? "" : "bad"}" aria-hidden="true"></span><span class="system-status-text ${allNominal ? "ok" : "warn"}">${allNominal ? "All Systems Nominal" : "Attention Required"}</span></div>
    <div class="system-detail">${allNominal ? `${totals.projects}/${config.projects.length} instances online · ${totals.running} active sessions · 0 retrying` : `${totals.retrying} retrying · ${totals.inReview} awaiting review · ${config.projects.length - totals.projects} offline`}</div>
    <div class="system-counts"><span><strong>${totals.projects}/${config.projects.length}</strong>online</span><span><strong>${totals.running}</strong>active</span><span><strong>${totals.inReview}</strong>review</span><span><strong>${totals.retrying}</strong>retry</span></div>
  </div>
  <main>
    <section class="metrics" aria-label="Summary metrics">
      ${renderMetric("Online", `<span>${totals.projects}<span class="denom"> / ${config.projects.length}</span></span>`, "ok", "all instances reporting")}
      ${renderMetric("Active", totals.running, "accent", "sessions running", "active", "var(--accent)")}
      ${renderMetric("In Review", totals.inReview, "warn", "awaiting human", "review", "var(--warn)")}
      ${renderMetric("Retrying", totals.retrying, totals.retrying ? "bad" : "", totals.retrying ? "needs attention" : "no failures", "retrying", "var(--bad)")}
      ${renderMetric("Total Tokens", compactNumber(totals.tokens), "", "across all projects", "tokens", "var(--text-muted)")}
      ${renderMetric("Tokens In / Out", `${compactNumber(totals.inputTokens)} / ${compactNumber(totals.outputTokens)}`, "tight", `${tokenShare(totals.outputTokens, totals.inputTokens + totals.outputTokens)}% output`)}
      ${renderMetric("Tokens / Min", compactNumber(Math.round(totals.tokens / 18)), "", "rolling 18 min", "rate", "var(--text-muted)")}
      ${renderMetric("Avg Turns", totals.avgTurns, "", "per active session")}
    </section>
    <section class="layout">
      <div class="left-col">
        <aside class="panel">
          <div class="panel-head"><span class="panel-title">Projects <span class="count">${snapshots.length}</span></span><span class="panel-meta"><span class="ok">●</span> ${totals.projects} online</span></div>
          <div class="project-list-head"><span>Instance</span><span>RUN</span><span>REV</span><span>TOK</span></div>
          ${snapshots.map(renderProjectRow).join("")}
        </aside>
        ${renderAttentionPanel(totals, sessions, snapshots, lastSync)}
      </div>
      <section class="panel work-panel">
        <div class="panel-head"><span class="panel-title">Work Queue <span class="count" id="queue-title-count">${sessions.length} items</span></span><span class="panel-meta">updated ${escapeHtml(lastSync)}</span></div>
        ${renderTabs(sessions, totals)}
        ${sessions.length ? renderWorkTable(sessions) : `<div class="empty">No active sessions found.</div>`}
      </section>
    </section>
    ${renderActivityPanel(recentSessions, lastSync)}
    <section class="footer">
      <span>Refresh page to repoll Symphony instances · port ${escapeHtml(PORT)}</span>
      <span><span class="${allNominal ? "ok" : "warn"}">●</span> ${allNominal ? "SYNC OK" : "SYNC DEGRADED"} · ${escapeHtml(refreshSeconds)}s INTERVAL</span>
      <span>DATA AGE 0s</span>
    </section>
  </main>
  <div class="drawer-backdrop" id="drawer-backdrop"></div>
  <aside class="drawer" id="detail-drawer" aria-hidden="true"></aside>
  <script>
    (() => {
      const body = document.body;
      const themeButton = document.getElementById("theme-toggle");
      const sun = ${JSON.stringify(icon("sun"))};
      const moon = ${JSON.stringify(icon("moon"))};
      const setTheme = (theme) => {
        body.dataset.theme = theme;
        localStorage.theme = theme;
        themeButton.innerHTML = theme === "dark" ? sun : moon;
      };
      setTheme(localStorage.theme === "light" ? "light" : "dark");
      themeButton.addEventListener("click", () => setTheme(body.dataset.theme === "dark" ? "light" : "dark"));

      const refresh = () => location.reload();
      document.getElementById("refresh-button").addEventListener("click", refresh);
      window.addEventListener("keydown", (event) => {
        if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey && !event.altKey) refresh();
        if (event.key === "Escape") closeDrawer();
      });

      const rows = [...document.querySelectorAll("[data-session-row]")];
      const tabs = [...document.querySelectorAll("[data-filter]")];
      const projects = [...document.querySelectorAll("[data-project-row]")];
      const visibleCount = document.getElementById("visible-count");
      const queueTitleCount = document.getElementById("queue-title-count");
      let activeFilter = "all";
      let activeProject = "";
      function applyFilters() {
        let count = 0;
        rows.forEach((row) => {
          const status = row.dataset.status;
          const project = row.dataset.project;
          const visible = (activeFilter === "all" || status === activeFilter) && (!activeProject || project === activeProject);
          row.classList.toggle("hidden", !visible);
          if (visible) count += 1;
        });
        tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.filter === activeFilter));
        projects.forEach((project) => project.classList.toggle("selected", project.dataset.projectRow === activeProject));
        visibleCount.textContent = count;
        queueTitleCount.textContent = activeProject ? count + " · " + activeProject : count + " items";
      }
      tabs.forEach((tab) => tab.addEventListener("click", () => { activeFilter = tab.dataset.filter; applyFilters(); }));
      projects.forEach((project) => project.addEventListener("click", () => {
        activeProject = activeProject === project.dataset.projectRow ? "" : project.dataset.projectRow;
        applyFilters();
      }));

      const drawer = document.getElementById("detail-drawer");
      const backdrop = document.getElementById("drawer-backdrop");
      function closeDrawer() {
        drawer.classList.remove("open");
        backdrop.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
      }
      window.closeDrawer = closeDrawer;
      backdrop.addEventListener("click", closeDrawer);
      rows.forEach((row) => row.addEventListener("click", () => {
        drawer.innerHTML = row.querySelector("template").innerHTML;
        drawer.classList.add("open");
        backdrop.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
      }));
      applyFilters();
    })();
  </script>
</body>
</html>`;
}

function renderMetric(label, value, valueClass = "", sub = "", sparkKey = null, sparkColor = "currentColor") {
  const spark = sparkKey ? renderSparkline(sparkSamples[sparkKey] || [], sparkColor) : "";
  return `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value ${escapeHtml(valueClass)}">${value}</div>${sub ? `<div class="metric-sub">${escapeHtml(sub)}</div>` : ""}${spark}</div>`;
}

function renderSparkline(values, color) {
  if (!values.length) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const width = 60;
  const height = 18;
  const step = width / (values.length - 1);
  const d = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * (height - 2) - 1;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="metric-spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="color:${escapeHtml(color)}"><path d="${escapeHtml(d)}"></path></svg>`;
}

function renderProjectRow(project) {
  const reviewCount = project.sessions.filter((session) => pillClass(session.linearStatus) === "review").length;
  const branch = project.branch || "main";
  return `<div class="project-row ${project.online ? "" : "offline"}" data-project-row="${escapeHtml(project.name)}" role="button" tabindex="0">
    <div class="project-info">
      <div class="project-name"><span class="dot" aria-hidden="true"></span><span>${escapeHtml(project.name)}</span></div>
      <div class="project-meta"><span class="branch mono">${escapeHtml(branch)}</span><span class="port mono">${project.port ? `:${escapeHtml(project.port)}` : escapeHtml(project.url)}</span></div>
    </div>
    <span class="pcell run ${project.running ? "" : "zero"}">${escapeHtml(project.running)}</span>
    <span class="pcell rev ${reviewCount ? "" : "zero"}">${escapeHtml(reviewCount)}</span>
    <span class="pcell">${compactNumber(project.totalTokens)}</span>
  </div>`;
}

function renderTabs(sessions, totals) {
  const counts = {
    all: sessions.length,
    active: totals.running,
    review: totals.inReview,
    bad: totals.retrying,
    done: totals.done,
    neutral: totals.idle,
  };
  return `<div class="queue-tabs">
    ${renderTab("all", "All", counts.all)}
    ${renderTab("active", "Active", counts.active)}
    ${renderTab("review", "In Review", counts.review, "review")}
    ${renderTab("bad", "Retrying", counts.bad, "bad")}
    ${renderTab("done", "Done", counts.done)}
    ${renderTab("neutral", "Idle", counts.neutral)}
    <div class="queue-tools"><span>${icon("filter")}Group: None</span><span>${icon("sort")}Sort: Updated</span></div>
  </div>`;
}

function renderTab(filter, label, count, kind = "") {
  return `<button class="qtab ${filter === "all" ? "active" : ""} ${kind}" type="button" data-filter="${escapeHtml(filter)}">${escapeHtml(label)} <span class="badge mono">${escapeHtml(count)}</span></button>`;
}

function renderWorkTable(sessions) {
  return `<div class="table-wrap"><table class="queue-table">
    <colgroup><col style="width:78px"><col><col style="width:124px"><col style="width:110px"><col style="width:88px"><col style="width:64px"><col style="width:110px"></colgroup>
    <thead><tr><th>ID</th><th>Title</th><th>Project</th><th>State</th><th class="right">Runtime</th><th class="right">Turns</th><th class="right">Tokens</th></tr></thead>
    <tbody>
      ${sessions.map(renderSessionRow).join("")}
    </tbody>
  </table></div>`;
}

function renderSessionRow(session) {
  const cls = pillClass(session.linearStatus);
  const lastEvent = relativeTime(session.lastEventAt);
  return `<tr data-session-row data-status="${escapeHtml(cls)}" data-project="${escapeHtml(session.runtimeName)}">
    <td><span class="issue-id">${escapeHtml(session.issueId)}</span></td>
    <td><span class="qcell-title">${escapeHtml(session.title)}</span><span class="qcell-sub">${escapeHtml(session.lastMessage)}</span></td>
    <td><span class="qcell-project">${escapeHtml(session.runtimeName)}</span><span class="qcell-sub mono">${escapeHtml(lastEvent)}</span></td>
    <td>${renderStatusPill(session.linearStatus)}</td>
    <td class="num">${escapeHtml(session.runtime)}<span class="qcell-sub mono">${escapeHtml(session.turns)} turns</span></td>
    <td class="num">${session.turns || "—"}</td>
    <td class="num">${fullNumber(session.tokens.total_tokens || 0)}<span class="qcell-sub mono">${compactNumber(session.tokens.input_tokens || 0)} / ${compactNumber(session.tokens.output_tokens || 0)}</span></td>
    <template>${renderDrawer(session)}</template>
  </tr>`;
}

function renderStatusPill(status) {
  const cls = pillClass(status);
  return `<span class="pill ${escapeHtml(cls)}"><span class="pill-dot" aria-hidden="true"></span>${escapeHtml(status)}</span>`;
}

function renderActivityPanel(sessions, lastSync) {
  return `<section class="panel">
    <div class="panel-head"><span class="panel-title">Recent Activity <span class="count">last ${sessions.length} events</span></span><span class="panel-meta">live · ${escapeHtml(lastSync)}</span></div>
    ${sessions.length ? `<div class="activity-grid">${sessions.map((session) => `<div class="activity-row"><span class="activity-time">${escapeHtml(relativeTime(session.lastEventAt))}</span><a class="activity-id" href="${escapeHtml(session.url)}" target="_blank" rel="noreferrer">${escapeHtml(session.issueId)}</a><span class="activity-msg">${escapeHtml(session.lastMessage)}</span></div>`).join("")}</div>` : `<div class="empty">No recent activity.</div>`}
  </section>`;
}

function renderAttentionPanel(totals, sessions, snapshots, lastSync) {
  const retryItems = sessions.filter((session) => pillClass(session.linearStatus) === "bad");
  const reviewItems = sessions.filter((session) => pillClass(session.linearStatus) === "review");
  const offline = snapshots.filter((project) => !project.online);
  return `<aside class="panel">
    <div class="panel-head"><span class="panel-title">Attention</span></div>
    ${totals.retrying > 0
      ? `<div class="attn-row"><span class="attn-icon bad">!</span><span class="attn-text">${totals.retrying} ${totals.retrying === 1 ? "task is" : "tasks are"} retrying<span class="muted">${escapeHtml(retryItems.map((session) => session.issueId).join(", "))}</span></span></div>`
      : `<div class="attn-row"><span class="attn-icon ok">✓</span><span class="attn-text">No retrying tasks<span class="muted">all sessions stable</span></span></div>`}
    ${totals.inReview > 0 ? `<div class="attn-row"><span class="attn-icon warn">⊙</span><span class="attn-text">${totals.inReview} awaiting review<span class="muted">${escapeHtml(reviewItems.slice(0, 3).map((session) => session.issueId).join(", "))}${reviewItems.length > 3 ? ` +${reviewItems.length - 3}` : ""}</span></span></div>` : ""}
    <div class="attn-row"><span class="attn-icon ${offline.length ? "bad" : "ok"}">${offline.length ? "!" : "✓"}</span><span class="attn-text">${offline.length ? `${offline.length} offline instance${offline.length === 1 ? "" : "s"}` : "All instances responding"}<span class="muted">last poll ${escapeHtml(lastSync)}</span></span></div>
  </aside>`;
}

function renderDrawer(session) {
  return `<div class="drawer-head">
    <div style="display:flex;align-items:center;gap:12px"><span class="drawer-id">${escapeHtml(session.issueId)}</span>${renderStatusPill(session.linearStatus)}</div>
    <button class="drawer-close" type="button" onclick="closeDrawer()" aria-label="Close">${icon("close")}</button>
  </div>
  <div class="drawer-body">
    <div class="drawer-section"><h4>Title</h4><h2 class="drawer-title">${escapeHtml(session.title)}</h2><p class="drawer-prose" style="color:var(--text-muted);margin-top:6px">${escapeHtml(session.runtimeName)}</p></div>
    <div class="drawer-section"><h4>Remaining work</h4><p class="drawer-prose">${escapeHtml(session.remaining)}</p></div>
    <div class="drawer-section"><h4>Latest event</h4><p class="drawer-prose">${escapeHtml(session.lastMessage)}</p><p class="drawer-prose mono" style="color:var(--text-faint);font-size:11px;margin-top:6px">${escapeHtml(relativeTime(session.lastEventAt))}</p></div>
    <div class="drawer-section"><h4>Telemetry</h4><div class="drawer-grid">
      <div><div class="label">Runtime</div><div class="value">${escapeHtml(session.runtime)}</div></div>
      <div><div class="label">Turns</div><div class="value">${escapeHtml(session.turns)}</div></div>
      <div><div class="label">Tokens In</div><div class="value">${compactNumber(session.tokens.input_tokens || 0)}</div></div>
      <div><div class="label">Tokens Out</div><div class="value">${compactNumber(session.tokens.output_tokens || 0)}</div></div>
    </div></div>
  </div>`;
}

function pillClass(status) {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("retry") || normalized.includes("fail") || normalized.includes("error")) return "bad";
  return statusClass(status);
}

function tokenShare(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function icon(name) {
  const paths = {
    refresh: `<path d="M2 7a5 5 0 0 1 9-3l1.5 1.5"></path><path d="M12.5 2v3.5H9"></path><path d="M12 7a5 5 0 0 1-9 3L1.5 8.5"></path><path d="M1.5 12V8.5H5"></path>`,
    external: `<path d="M5 2H2v11h11v-3"></path><path d="M9 2h4v4"></path><path d="M7 8l6-6"></path>`,
    sun: `<circle cx="7" cy="7" r="3"></circle><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1.05 1.05M10.35 10.35l1.05 1.05M2.6 11.4l1.05-1.05M10.35 3.65l1.05-1.05"></path>`,
    moon: `<path d="M11.5 8.5A4.5 4.5 0 1 1 5.5 2.5a3.5 3.5 0 0 0 6 6z"></path>`,
    sort: `<path d="M3 4l3-3 3 3"></path><path d="M6 1v12"></path><path d="M11 9l-3 3-3-3"></path>`,
    filter: `<path d="M2 2h11l-4 5v5l-3-1V7L2 2z"></path>`,
    close: `<path d="M3 3l8 8M11 3l-8 8"></path>`,
  };
  return `<svg class="icon" viewBox="0 0 14 14" aria-hidden="true">${paths[name] || ""}</svg>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
}
