#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

const JOBS_DIR = process.env.CODEX_ADMIN_JOBS_DIR || "/home/ubuntu/.codex-admin-panel/jobs";
const LOCK_FILE = process.env.CODEX_ADMIN_LOCK_FILE || "/home/ubuntu/.codex-admin-panel/worker.lock";
const CODEX_CLI_PATH = process.env.CODEX_CLI_PATH || "codex";
const CODEX_ADMIN_WORKDIR = process.env.CODEX_ADMIN_WORKDIR || "/home/ubuntu/shooting-system";
const CODEX_ADMIN_TIMEOUT_MS = Number(process.env.CODEX_ADMIN_TIMEOUT_MS || 45 * 60 * 1000);
const CODEX_ADMIN_SANDBOX = process.env.CODEX_ADMIN_SANDBOX || "workspace-write";
const MAX_CAPTURED_STDERR = 12000;
const MAX_COMMANDS = 120;
const MAX_ERRORS = 50;

function nowIso() {
  return new Date().toISOString();
}

function jobPath(jobId) {
  return join(JOBS_DIR, `${jobId}.json`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, data) {
  const tempPath = `${path}.${process.pid}.tmp`;

  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, path);
}

async function updateJob(job, patch) {
  const nextJob = {
    ...job,
    ...patch,
    updatedAt: nowIso(),
  };

  await writeJson(jobPath(job.id), nextJob);

  return nextJob;
}

function appendTail(current, chunk, maxLength) {
  const next = `${current}${chunk}`;

  return next.length > maxLength
    ? next.slice(next.length - maxLength)
    : next;
}

function parseCodexLine(line, state) {
  try {
    const event = JSON.parse(line);

    if (event.type === "thread.started" && event.thread_id) {
      state.threadId = event.thread_id;
    }

    if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
      state.answer = event.item.text;
    }

    if (event.type === "item.started" && event.item?.type === "command_execution" && event.item.command) {
      if (state.commands.length < MAX_COMMANDS) {
        state.commands.push(event.item.command);
      }
    }

    if (event.type === "error" && event.message) {
      if (state.errors.length < MAX_ERRORS) {
        state.errors.push(event.message);
      }
    }
  } catch {
    if (!state.answer && line.trim()) {
      state.answer = line.trim();
    }
  }
}

function commandEnv() {
  return {
    HOME: process.env.HOME || "/home/ubuntu",
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    CODEX_HOME: process.env.CODEX_HOME || "/home/ubuntu/.codex",
    NODE_ENV: process.env.NODE_ENV || "production",
  };
}

function runCodex(job) {
  const args = [
    "--ask-for-approval",
    "never",
    "exec",
    "--json",
    "--sandbox",
    CODEX_ADMIN_SANDBOX,
    "-C",
    CODEX_ADMIN_WORKDIR,
    job.codexPrompt,
  ];

  return new Promise((resolve) => {
    const state = {
      answer: "",
      commands: [],
      errors: [],
      stderr: "",
      threadId: "",
      timedOut: false,
    };
    let lineBuffer = "";
    let settled = false;

    const child = spawn(CODEX_CLI_PATH, args, {
      cwd: CODEX_ADMIN_WORKDIR,
      env: commandEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end();

    const timeoutId = setTimeout(() => {
      state.timedOut = true;
      child.kill("SIGTERM");

      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 10000).unref();
    }, CODEX_ADMIN_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      lineBuffer += chunk.toString("utf8");
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed) {
          parseCodexLine(trimmed, state);
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      state.stderr = appendTail(state.stderr, chunk.toString("utf8"), MAX_CAPTURED_STDERR);
    });

    child.on("error", (error) => {
      state.errors.push(error.message);
    });

    child.on("close", (exitCode, signal) => {
      settled = true;
      clearTimeout(timeoutId);

      const trimmedLine = lineBuffer.trim();

      if (trimmedLine) {
        parseCodexLine(trimmedLine, state);
      }

      resolve({
        ...state,
        exitCode,
        signal,
      });
    });
  });
}

function resultDetail(result) {
  if (result.timedOut) {
    return "Codex przekroczyl limit czasu wykonania.";
  }

  if (result.errors.length) {
    return result.errors.join("\n");
  }

  if (result.stderr.trim()) {
    return result.stderr.trim().slice(-4000);
  }

  return "Codex zakonczyl prace bledem.";
}

async function listJobs() {
  await mkdir(JOBS_DIR, { recursive: true, mode: 0o700 });
  const files = await readdir(JOBS_DIR);
  const jobs = [];

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    try {
      jobs.push(await readJson(join(JOBS_DIR, file)));
    } catch {
      // Ignore partially written or corrupt job files; future writes use atomic rename.
    }
  }

  return jobs.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

async function acquireLock() {
  await mkdir(JOBS_DIR, { recursive: true, mode: 0o700 });
  await writeFile(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: nowIso() }), {
    flag: "wx",
    mode: 0o600,
  });
}

async function releaseLock() {
  await rm(LOCK_FILE, { force: true });
}

async function resetInterruptedJobs() {
  const jobs = await listJobs();

  for (const job of jobs) {
    if (job.status === "running") {
      await updateJob(job, {
        status: "queued",
        detail: "Runner zostal przerwany. Zadanie wraca do kolejki.",
      });
    }
  }
}

async function nextQueuedJob() {
  const jobs = await listJobs();

  return jobs.find((job) => job.status === "queued") || null;
}

async function run() {
  try {
    await acquireLock();
  } catch {
    return;
  }

  try {
    await resetInterruptedJobs();

    while (true) {
      const queuedJob = await nextQueuedJob();

      if (!queuedJob) {
        return;
      }

      const startedAt = nowIso();
      let job = await updateJob(queuedJob, {
        status: "running",
        startedAt,
        answer: "",
        detail: "",
        errors: [],
        commands: [],
        threadId: "",
        exitCode: null,
        signal: null,
        timedOut: false,
      });

      const result = await runCodex(job);
      const finishedAt = nowIso();
      const ok = result.exitCode === 0 && !result.timedOut;

      job = await updateJob(job, {
        status: ok ? "completed" : "failed",
        finishedAt,
        durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
        answer: result.answer || "",
        detail: ok ? "" : resultDetail(result),
        errors: result.errors,
        commands: result.commands,
        threadId: result.threadId,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
      });
    }
  } finally {
    await releaseLock();
  }
}

run().catch(async (error) => {
  try {
    await releaseLock();
  } finally {
    console.error(error);
    process.exitCode = 1;
  }
});
