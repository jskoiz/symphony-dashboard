#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderDashboard } from "../src/server.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..");

process.env.SYMPHONY_DASHBOARD_CONFIG = path.join(projectRoot, "config", "projects.sample.json");
process.env.SYMPHONY_DASHBOARD_PORT ||= "4050";

const html = await renderDashboard();
const publicOutputPath = path.join(projectRoot, "public", "index.html");
const rootOutputPath = path.join(projectRoot, "index.html");

await fs.writeFile(publicOutputPath, html);
await fs.writeFile(rootOutputPath, html);
console.log(`Wrote ${publicOutputPath}`);
console.log(`Wrote ${rootOutputPath}`);
