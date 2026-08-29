import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CodexChatMessage = {
  role?: string;
  content?: string;
};

type CodexJsonEvent = {
  type?: string;
  thread_id?: string;
  item?: {
    type?: string;
    text?: string;
    command?: string;
  };
  message?: string;
};

let codexRunInProgress = false;

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

async function verifyAdmin(authorization: string) {
  if (!authorization.startsWith("Bearer ")) {
    return false;
  }

  const response = await fetch(backendUrl("/me"), {
    headers: {
      Authorization: authorization,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return false;
  }

  const user = await response.json().catch(() => ({}));
  const roles = Array.isArray(user.roles) ? user.roles : [];

  return roles.includes("admin");
}

function formatHistory(history: CodexChatMessage[]) {
  return history
    .filter((message) => message.role && message.content)
    .slice(-10)
    .map((message) => {
      const role = message.role === "user" ? "Uzytkownik" : "Codex";
      const content = String(message.content).slice(0, 4000);

      return `${role}: ${content}`;
    })
    .join("\n\n");
}

function buildCodexPrompt(prompt: string, history: CodexChatMessage[]) {
  const historyText = formatHistory(history);

  return [
    "Jestes Codex uruchomiony z panelu admina Systemu Strzeleckiego na VPS.",
    "Pracujesz w repozytorium /home/ubuntu/shooting-system.",
    "Odpowiadaj po polsku, konkretnie i tak jak w rozmowie z administratorem technicznym.",
    "Jesli zmieniasz frontend, przeczytaj i respektuj frontend/AGENTS.md.",
    "Uzywaj najmniejszych sensownych zmian, uruchamiaj adekwatne testy i jasno raportuj wynik.",
    historyText ? `Kontekst ostatnich wiadomosci:\n\n${historyText}` : "",
    `Aktualne polecenie administratora:\n\n${prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseCodexOutput(stdout: string, stderr: string) {
  let answer = "";
  let threadId = "";
  const commands: string[] = [];
  const errors: string[] = [];

  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      try {
        const event = JSON.parse(line) as CodexJsonEvent;

        if (event.type === "thread.started" && event.thread_id) {
          threadId = event.thread_id;
        }

        if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
          answer = event.item.text;
        }

        if (event.type === "item.started" && event.item?.type === "command_execution" && event.item.command) {
          commands.push(event.item.command);
        }

        if (event.type === "error" && event.message) {
          errors.push(event.message);
        }
      } catch {
        if (!answer) {
          answer = line;
        }
      }
    });

  if (!answer && stderr.trim()) {
    answer = stderr.trim().slice(-4000);
  }

  return {
    answer,
    commands,
    errors,
    threadId,
  };
}

function runCodex(prompt: string) {
  const command = process.env.CODEX_CLI_PATH || "codex";
  const workdir = process.env.CODEX_ADMIN_WORKDIR;
  const timeoutMs = Number(process.env.CODEX_ADMIN_TIMEOUT_MS || 10 * 60 * 1000);
  const childEnv: NodeJS.ProcessEnv = {
    HOME: process.env.HOME || "/home/ubuntu",
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    CODEX_HOME: process.env.CODEX_HOME || "/home/ubuntu/.codex",
    NODE_ENV: process.env.NODE_ENV || "production",
  };
  const args = [
    "exec",
    "--json",
    "--sandbox",
    "workspace-write",
    prompt,
  ];

  if (workdir) {
    args.splice(args.length - 1, 0, "-C", workdir);
  }

  return new Promise<{
    answer: string;
    commands: string[];
    errors: string[];
    exitCode: number | null;
    stderr: string;
    threadId: string;
  }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, args, {
      cwd: workdir || undefined,
      env: childEnv,
    });

    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      reject(new Error("Codex przekroczyl limit czasu wykonania."));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      const parsedOutput = parseCodexOutput(stdout, stderr);

      resolve({
        ...parsedOutput,
        exitCode,
        stderr,
      });
    });
  });
}

export async function POST(request: Request) {
  if (codexRunInProgress) {
    return jsonResponse(
      { detail: "Codex juz pracuje nad poprzednim poleceniem. Poczekaj na wynik." },
      409
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const adminIsVerified = await verifyAdmin(authorization).catch(() => false);

  if (!adminIsVerified) {
    return jsonResponse(
      { detail: "Brak uprawnien administratora." },
      403
    );
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const history = Array.isArray(body.history) ? body.history : [];

  if (!prompt) {
    return jsonResponse(
      { detail: "Wpisz polecenie dla Codex." },
      400
    );
  }

  if (prompt.length > 12000) {
    return jsonResponse(
      { detail: "Polecenie jest zbyt dlugie. Skroc je do 12000 znakow." },
      400
    );
  }

  codexRunInProgress = true;

  try {
    const result = await runCodex(buildCodexPrompt(prompt, history));

    if (result.exitCode !== 0) {
      return jsonResponse(
        {
          answer: result.answer,
          detail: result.answer || result.stderr || "Codex zakonczyl prace bledem.",
          errors: result.errors,
          threadId: result.threadId,
        },
        500
      );
    }

    return jsonResponse(
      {
        answer: result.answer,
        commands: result.commands,
        errors: result.errors,
        threadId: result.threadId,
      },
      200
    );
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : "Nie udalo sie uruchomic Codex.";

    return jsonResponse({ detail }, 500);
  } finally {
    codexRunInProgress = false;
  }
}
