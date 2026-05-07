import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureAgentJwtSecretBootstrap } from "../bootstrap-agent-jwt.js";

const SECRET_ENV = "PAPERCLIP_AGENT_JWT_SECRET";
const BETTER_AUTH_ENV = "BETTER_AUTH_SECRET";

describe("ensureAgentJwtSecretBootstrap", () => {
  let tmpDir: string;
  let envFilePath: string;
  const original = {
    secret: process.env[SECRET_ENV],
    betterAuth: process.env[BETTER_AUTH_ENV],
  };

  beforeEach(() => {
    delete process.env[SECRET_ENV];
    delete process.env[BETTER_AUTH_ENV];
    tmpDir = mkdtempSync(join(tmpdir(), "paperclip-bootstrap-jwt-"));
    envFilePath = join(tmpDir, ".env");
  });

  afterEach(() => {
    if (original.secret === undefined) delete process.env[SECRET_ENV];
    else process.env[SECRET_ENV] = original.secret;
    if (original.betterAuth === undefined) delete process.env[BETTER_AUTH_ENV];
    else process.env[BETTER_AUTH_ENV] = original.betterAuth;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns already-set when PAPERCLIP_AGENT_JWT_SECRET is present", () => {
    process.env[SECRET_ENV] = "preexisting-secret";
    const result = ensureAgentJwtSecretBootstrap({
      deploymentMode: "local_trusted",
      envFilePath,
    });
    expect(result.status).toBe("already-set");
    expect(existsSync(envFilePath)).toBe(false);
  });

  it("returns already-set when BETTER_AUTH_SECRET is present", () => {
    process.env[BETTER_AUTH_ENV] = "better-auth-secret";
    const result = ensureAgentJwtSecretBootstrap({
      deploymentMode: "local_trusted",
      envFilePath,
    });
    expect(result.status).toBe("already-set");
    expect(existsSync(envFilePath)).toBe(false);
  });

  it("creates secret in process env and writes .env in local_trusted mode", () => {
    const result = ensureAgentJwtSecretBootstrap({
      deploymentMode: "local_trusted",
      envFilePath,
      generateSecret: () => "deterministic-test-secret",
    });
    expect(result.status).toBe("created");
    expect(result.secret).toBe("deterministic-test-secret");
    expect(process.env[SECRET_ENV]).toBe("deterministic-test-secret");
    const contents = readFileSync(envFilePath, "utf-8");
    expect(contents).toContain("PAPERCLIP_AGENT_JWT_SECRET=deterministic-test-secret");
    expect(statSync(envFilePath).mode & 0o777).toBe(0o600);
  });

  it("preserves existing entries in .env when bootstrapping", () => {
    writeFileSync(envFilePath, "OTHER_KEY=keep-me\nDATABASE_URL=postgres://x\n", { mode: 0o600 });
    const result = ensureAgentJwtSecretBootstrap({
      deploymentMode: "local_trusted",
      envFilePath,
      generateSecret: () => "new-secret",
    });
    expect(result.status).toBe("created");
    const contents = readFileSync(envFilePath, "utf-8");
    expect(contents).toContain("OTHER_KEY=keep-me");
    expect(contents).toContain("DATABASE_URL=postgres://x");
    expect(contents).toContain("PAPERCLIP_AGENT_JWT_SECRET=new-secret");
  });

  it("skips bootstrap when deployment is not local_trusted", () => {
    const result = ensureAgentJwtSecretBootstrap({
      deploymentMode: "authenticated",
      envFilePath,
    });
    expect(result.status).toBe("skipped");
    expect(process.env[SECRET_ENV]).toBeUndefined();
    expect(existsSync(envFilePath)).toBe(false);
  });
});
