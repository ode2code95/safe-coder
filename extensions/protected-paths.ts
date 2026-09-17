// @ts-nocheck
/**
 * Protected Paths Extension
 *
 * Blocks write and edit operations to protected paths.
 * Useful for preventing accidental modifications to sensitive files.
 *
 * Configuration is read from ~/.pi/agent/safe-coder.json at startup.
 * See README.md for details.
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ── Built-in defaults (always applied first) ────────────────────────────────

const DEFAULT_PROTECTED_PATHS = [".env", ".git/", "node_modules/"];

// ── Config loading ──────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), ".pi", "agent");
const CONFIG_FILE = path.join(CONFIG_DIR, "safe-coder.json");

interface SafeCoderConfig {
	allowedWritePaths?: string[];
}

/** Resolve a single path, expanding ~ to home directory. */
function resolvePath(p: string): string {
	if (p === "~") return os.homedir();
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
	if (/^~[^/\\]+/.test(p)) return path.join(path.dirname(os.homedir()), p.slice(1));
	return p;
}

/** Merge user config arrays with built-in defaults (defaults first, deduplicated). */
function mergeArrays(defaults: string[], configValues?: string[]): string[] {
	const resolved = new Set<string>();
	for (const d of defaults) resolved.add(resolvePath(d));
	if (configValues) {
		for (const c of configValues) resolved.add(resolvePath(c));
	}
	return [...resolved];
}

/** Load and parse the config file, returning null on any error. */
function loadConfig(): SafeCoderConfig | null {
	try {
		const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
		return JSON.parse(raw) as SafeCoderConfig;
	} catch {
		return null;
	}
}

// ── Resolved paths ──────────────────────────────────────────────────────────

const config = loadConfig();

const PROTECTED_PATHS = DEFAULT_PROTECTED_PATHS; // Core protections are always enforced

// ── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		const targetPath = event.input.path as string | undefined;
		if (!targetPath) return undefined;

		// Block all operations on .env (always protected)
		if (targetPath.includes(".env")) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked access to protected path: ${targetPath}`, "warning");
			}
			return { block: true, reason: `Path "${targetPath}" is fully protected` };
		}

		// For other protected paths, only block write/edit operations
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}

		const isProtected = PROTECTED_PATHS.some((p) => targetPath.includes(p));

		if (isProtected) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked write to protected path: ${targetPath}`, "warning");
			}
			return { block: true, reason: `Path "${targetPath}" is protected` };
		}

		return undefined;
	});
}
