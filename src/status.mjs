#!/usr/bin/env node
import { loadConfig } from "./config.mjs";
import { loadProject } from "./lib.mjs";

const config = await loadConfig();
const snapshots = await Promise.all(config.projects.map((project) => loadProject(project, config.issues)));

for (const project of snapshots) {
  const label = project.port ? `:${project.port}` : project.url;
  if (!project.online) {
    console.log(`\n${project.name} ${label} offline (${project.error})`);
    continue;
  }

  const issueIds = project.sessions.map((session) => session.issueId);
  console.log(`\n${project.name} ${label} ${issueIds.length ? issueIds.join(", ") : "idle"}`);
  for (const session of project.sessions) {
    const message = String(session.lastMessage || "n/a").replace(/\s+/g, " ").slice(0, 140);
    console.log(
      `  ${session.issueId} | ${session.state} | turns=${session.turns} | tokens=${session.tokens?.total_tokens ?? 0} | ${session.lastEventAt || "n/a"} | ${message}`,
    );
  }
}
