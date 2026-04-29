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
const outputPath = path.join(projectRoot, "public", "index.html");

await fs.writeFile(outputPath, html);
console.log(`Wrote ${outputPath}`);
