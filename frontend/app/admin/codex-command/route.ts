import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const promptCharacterLimit = 12000;
const historyMessageLimit = 120;
const contextMessageLimit = 10;
const maxQueueSize = 20;
const defaultTimeoutMs = 45 * 60 * 1000;
const jobsDir = process.env.CODEX_ADMIN_JOBS_DIR || "/home/ubuntu/.codex-admin-panel/jobs";
const lockFile = process.env.CODEX_ADMIN_LOCK_FILE || "/home/ubuntu/.codex-admin-panel/worker.lock";
const runnerPath = join(process.cwd(), "scripts", "admin-codex-runner.mjs");
const codexSandbox = process.env.CODEX_ADMIN_SANDBOX || "workspace-write";

type CodexChatRole = "user" | "assistant";
type CodexJobStatus = "queued" | "running" | "completed" | "failed";

type CodexChatMessage = {
  id: string;
  role: CodexChatRole;
  content: string;
  createdAt: string;
  jobId?: string;
  status?: CodexJobStatus;
};

type CodexStoredJob = {
  id: string;
  status: CodexJobStatus;
  prompt: string;
  codexPrompt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  answer?: string;
  detail?: string;
  errors?: string[];
  commands?: string[];
  threadId?: string;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
};

type VerifiedAdmin = {
  email: string;
};

function backendUrl(path: string) {
  const baseUrl = process.env.API_URL || "http://127.0.0.1:8000";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
}

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function executionTimeoutMs() {
  const value = Number(process.env.CODEX_ADMIN_TIMEOUT_MS || defaultTimeoutMs);

  return Number.isFinite(value) && value > 0
    ? value
    : defaultTimeoutMs;
}

function codexWorkdir() {
  return process.env.CODEX_ADMIN_WORKDIR || "/home/ubuntu/shooting-system";
}

function codexCliPath() {
  return process.env.CODEX_CLI_PATH || "codex";
}

async function verifyAdmin(authorization: string): Promise<VerifiedAdmin | null> {
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const response = await fetch(backendUrl("/me"), {
    headers: {
      Authorization: authorization,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json().catch(() => ({}));
  const roles = Array.isArray(user.roles) ? user.roles : [];

  if (!roles.includes("admin")) {
    return null;
  }

  return {
    email: typeof user.email === "string" ? user.email : "",
  };
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const admin = await verifyAdmin(authorization).catch(() => null);

  if (!admin) {
    return {
      admin: null,
      response: jsonResponse({ detail: "Brak uprawnien administratora." }, 403),
    };
  }

  return {
    admin,
    response: null,
  };
}

function jobPath(jobId: string) {
  return join(jobsDir, `${jobId}.json`);
}

async function ensureJobsDir() {
  await mkdir(jobsDir, {
    recursive: true,
    mode: 0o700,
  });
}

async function readJsonFile<T>(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJob(job: CodexStoredJob) {
  await ensureJobsDir();
  await writeFile(jobPath(job.id), `${JSON.stringify(job, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(jobPath(job.id), 0o600);
}

async function listJobs() {
  await ensureJobsDir();
  const files = await readdir(jobsDir);
  const jobs: CodexStoredJob[] = [];

  await Promise.all(files.map(async (file) => {
    if (!file.endsWith(".json")) {
      return;
    }

    try {
      jobs.push(await readJsonFile<CodexStoredJob>(join(jobsDir, file)));
    } catch {
      // Ignore incomplete files; runner writes job updates atomically.
    }
  }));

  return jobs.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

function processIsRunning(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function lockPid() {
  try {
    const lock = await readJsonFile<{ pid?: number }>(lockFile);

    return typeof lock.pid === "number" ? lock.pid : null;
  } catch {
    return null;
  }
}

async function workerIsActive() {
  const pid = await lockPid();

  return pid ? processIsRunning(pid) : false;
}

async function clearStaleLock() {
  const pid = await lockPid();

  if (!pid || !processIsRunning(pid)) {
    await rm(lockFile, { force: true });
  }
}

async function startWorkerIfNeeded(jobs?: CodexStoredJob[]) {
  const currentJobs = jobs || await listJobs();
  const hasQueuedJobs = currentJobs.some((job) => job.status === "queued");

  if (!hasQueuedJobs) {
    return;
  }

  await clearStaleLock();

  if (await workerIsActive()) {
    return;
  }

  if (!existsSync(runnerPath)) {
    throw new Error("Nie znaleziono runnera Codex na VPS.");
  }

  const child = spawn(process.execPath, [runnerPath], {
    cwd: process.cwd(),
    detached: true,
    env: {
      HOME: process.env.HOME || "/home/ubuntu",
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      CODEX_HOME: process.env.CODEX_HOME || "/home/ubuntu/.codex",
      NODE_ENV: process.env.NODE_ENV || "production",
      CODEX_ADMIN_JOBS_DIR: jobsDir,
      CODEX_ADMIN_LOCK_FILE: lockFile,
      CODEX_CLI_PATH: codexCliPath(),
      CODEX_ADMIN_WORKDIR: codexWorkdir(),
      CODEX_ADMIN_TIMEOUT_MS: String(executionTimeoutMs()),
      CODEX_ADMIN_SANDBOX: codexSandbox,
    },
    stdio: "ignore",
  });

  child.unref();
}

async function recoverInterruptedJobs(jobs: CodexStoredJob[]) {
  await clearStaleLock();

  if (await workerIsActive()) {
    return jobs;
  }

  let changed = false;

  await Promise.all(jobs.map(async (job) => {
    if (job.status !== "running") {
      return;
    }

    changed = true;
    await writeJob({
      ...job,
      status: "queued",
      updatedAt: nowIso(),
      detail: "Runner zostal przerwany. Zadanie wrocilo do kolejki.",
    });
  }));

  return changed ? listJobs() : jobs;
}

function formatHistory(jobs: CodexStoredJob[]) {
  const messages: CodexChatMessage[] = [
    {
      id: "codex-welcome",
      role: "assistant",
      content: "Gotowy. Napisz polecenie, a uruchomię Codex na VPS w repozytorium projektu.",
      createdAt: new Date(0).toISOString(),
    },
  ];

  for (const job of jobs.slice(-historyMessageLimit)) {
    messages.push({
      id: `${job.id}-user`,
      role: "user",
      content: job.prompt,
      createdAt: job.createdAt,
      jobId: job.id,
      status: job.status,
    });

    if (job.status === "queued" || job.status === "running") {
      messages.push({
        id: `${job.id}-pending`,
        role: "assistant",
        content: job.status === "queued"
          ? "Zadanie czeka w kolejce."
          : "Codex pracuje na VPS...",
        createdAt: job.updatedAt,
        jobId: job.id,
        status: job.status,
      });
      continue;
    }

    const detail = job.detail ? `\n\nStatus techniczny: ${job.detail}` : "";
    const failedSuffix = job.status === "failed"
      ? `${detail || "\n\nStatus techniczny: Codex zakonczyl prace bledem."}`
      : "";

    messages.push({
      id: `${job.id}-assistant`,
      role: "assistant",
      content: `${job.answer || "Codex zakończył pracę bez wiadomości końcowej."}${failedSuffix}`,
      createdAt: job.finishedAt || job.updatedAt,
      jobId: job.id,
      status: job.status,
    });
  }

  return messages;
}

function buildCodexPrompt(prompt: string, jobs: CodexStoredJob[]) {
  const historyText = jobs
    .slice(-contextMessageLimit)
    .flatMap((job) => {
      const entries = [`Uzytkownik: ${job.prompt.slice(0, 4000)}`];

      if (job.answer) {
        entries.push(`Codex: ${job.answer.slice(0, 4000)}`);
      }

      return entries;
    })
    .join("\n\n");

  return [
    "Jestes Codex uruchomiony z panelu admina Systemu Strzeleckiego na VPS.",
    "Pracujesz w repozytorium /home/ubuntu/shooting-system.",
    "Odpowiadaj po polsku, konkretnie i tak jak w rozmowie z administratorem technicznym.",
    "Jesli zmieniasz frontend, przeczytaj i respektuj frontend/AGENTS.md.",
    "Nie wypisuj sekretow ani tokenow. Jezeli tworzysz pliki z danymi uzytkownikow, nadaj im prywatne uprawnienia.",
    "Uzywaj najmniejszych sensownych zmian, uruchamiaj adekwatne testy i jasno raportuj wynik.",
    historyText ? `Kontekst ostatnich zakonczonych zadan:\n\n${historyText}` : "",
    `Aktualne polecenie administratora:\n\n${prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function limits(jobs: CodexStoredJob[], workerActive: boolean) {
  return {
    promptCharacters: promptCharacterLimit,
    contextMessages: contextMessageLimit,
    visibleHistoryMessages: historyMessageLimit,
    maxQueueSize,
    queuedJobs: jobs.filter((job) => job.status === "queued").length,
    runningJobs: jobs.filter((job) => job.status === "running").length,
    executionTimeoutMs: executionTimeoutMs(),
    sandbox: codexSandbox,
    workdir: codexWorkdir(),
    workerActive,
  };
}

function publicJobs(jobs: CodexStoredJob[]) {
  return jobs.slice(-historyMessageLimit).map((job) => ({
    id: job.id,
    status: job.status,
    prompt: job.prompt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    durationMs: job.durationMs,
    detail: job.detail,
    exitCode: job.exitCode,
    timedOut: job.timedOut,
  }));
}

function publicJob(job: CodexStoredJob) {
  return publicJobs([job])[0];
}

export async function GET(request: Request) {
  const { response } = await requireAdmin(request);

  if (response) {
    return response;
  }

  const jobs = await recoverInterruptedJobs(await listJobs());

  await startWorkerIfNeeded(jobs).catch(() => undefined);
  const updatedJobs = await listJobs();
  const activeWorker = await workerIsActive();

  return jsonResponse(
    {
      messages: formatHistory(updatedJobs),
      jobs: publicJobs(updatedJobs),
      limits: limits(updatedJobs, activeWorker),
    },
    200
  );
}

export async function POST(request: Request) {
  const { admin, response } = await requireAdmin(request);

  if (response || !admin) {
    return response || jsonResponse({ detail: "Brak uprawnien administratora." }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return jsonResponse(
      { detail: "Wpisz polecenie dla Codex." },
      400
    );
  }

  if (prompt.length > promptCharacterLimit) {
    return jsonResponse(
      { detail: `Polecenie jest zbyt dlugie. Skroc je do ${promptCharacterLimit} znakow.` },
      400
    );
  }

  const jobs = await recoverInterruptedJobs(await listJobs());
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");

  if (activeJobs.length >= maxQueueSize) {
    return jsonResponse(
      { detail: "Kolejka Codex jest pelna. Poczekaj na zakonczenie obecnych zadan." },
      429
    );
  }

  const now = nowIso();
  const job: CodexStoredJob = {
    id: randomUUID(),
    status: "queued",
    prompt,
    codexPrompt: buildCodexPrompt(prompt, jobs),
    createdAt: now,
    updatedAt: now,
    createdBy: admin.email,
    answer: "",
    detail: "",
    errors: [],
    commands: [],
    threadId: "",
    exitCode: null,
    signal: null,
    timedOut: false,
  };

  await writeJob(job);
  await startWorkerIfNeeded([...jobs, job]);

  const updatedJobs = await listJobs();

  return jsonResponse(
    {
      job: publicJob(job),
      messages: formatHistory(updatedJobs),
      jobs: publicJobs(updatedJobs),
      limits: limits(updatedJobs, await workerIsActive()),
    },
    202
  );
}
