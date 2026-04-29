import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..");

const defaultConfig = {
  dashboard: {
    title: "Symphony Control",
    linearUrl: "https://linear.app",
    refreshSeconds: 30,
  },
  projects: [],
  issues: {},
};

export function resolveConfigPath() {
  return process.env.SYMPHONY_DASHBOARD_CONFIG
    ? path.resolve(process.env.SYMPHONY_DASHBOARD_CONFIG)
    : path.join(projectRoot, "config", "projects.json");
}

export async function loadConfig() {
  const configPath = resolveConfigPath();
  let raw;

  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const examplePath = path.join(projectRoot, "config", "projects.example.json");
    raw = await fs.readFile(examplePath, "utf8");
  }

  const parsed = JSON.parse(raw);
  const config = {
    dashboard: { ...defaultConfig.dashboard, ...(parsed.dashboard || {}) },
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    issues: parsed.issues || {},
  };

  return {
    ...config,
    projects: config.projects.map(normalizeProject),
  };
}

function normalizeProject(project) {
  const port = Number(project.port);
  const url = project.url || (Number.isFinite(port) ? `http://127.0.0.1:${port}` : null);
  return {
    ...project,
    name: project.name || `Symphony ${project.port || project.url || ""}`.trim(),
    port: Number.isFinite(port) ? port : null,
    url,
    branch: project.branch || "main",
    workflow: project.workflow || "",
  };
}
