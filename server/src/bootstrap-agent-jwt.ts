import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { parse as parseEnvFile } from "dotenv";
import type { DeploymentMode } from "@paperclipai/shared";
import { resolvePaperclipEnvPath } from "./paths.js";

const SAFE_VALUE_RE = /^[A-Za-z0-9_./:@-]+$/;

interface MinimalLogger {
  info: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
}

export interface EnsureAgentJwtSecretOptions {
  deploymentMode: DeploymentMode;
  envFilePath?: string;
  logger?: MinimalLogger;
  generateSecret?: () => string;
}

export interface EnsureAgentJwtSecretResult {
  status: "already-set" | "created" | "skipped";
  secret?: string;
  envFilePath?: string;
}

function formatEnvValue(value: string): string {
  return SAFE_VALUE_RE.test(value) ? value : JSON.stringify(value);
}

function renderEnvFile(entries: Record<string, string>): string {
  const lines = [
    "# Paperclip environment (managed by server bootstrap)",
    ...Object.entries(entries).map(([k, v]) => `${k}=${formatEnvValue(v)}`),
    "",
  ];
  return lines.join("\n");
}

export function ensureAgentJwtSecretBootstrap(
  options: EnsureAgentJwtSecretOptions,
): EnsureAgentJwtSecretResult {
  const {
    deploymentMode,
    envFilePath = resolvePaperclipEnvPath(),
    logger,
    generateSecret = () => randomBytes(32).toString("hex"),
  } = options;

  const existing =
    process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();
  if (existing) {
    return { status: "already-set" };
  }

  if (deploymentMode !== "local_trusted") {
    logger?.warn?.(
      { deploymentMode, envFilePath },
      "agent jwt secret missing and deployment is not local_trusted; skipping auto-bootstrap",
    );
    return { status: "skipped", envFilePath };
  }

  const secret = generateSecret();
  const dir = path.dirname(envFilePath);
  fs.mkdirSync(dir, { recursive: true });

  const existingContents = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, "utf-8") : "";
  const parsed = existingContents ? parseEnvFile(existingContents) : {};
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") merged[key] = value;
  }
  merged.PAPERCLIP_AGENT_JWT_SECRET = secret;

  fs.writeFileSync(envFilePath, renderEnvFile(merged), { mode: 0o600 });
  process.env.PAPERCLIP_AGENT_JWT_SECRET = secret;

  logger?.info(
    { envFilePath },
    "auto-generated PAPERCLIP_AGENT_JWT_SECRET (local_trusted bootstrap)",
  );

  return { status: "created", secret, envFilePath };
}
