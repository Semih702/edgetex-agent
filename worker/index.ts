type AiMode = "generate" | "improve" | "fix" | "academic" | "review";

interface WorkersAI {
  run(model: string, input: unknown): Promise<unknown>;
}

interface Env {
  AI?: WorkersAI;
  DB?: D1Database;
  ASSETS?: Fetcher;
}

interface EditRequest {
  documentId?: string;
  content: string;
  instruction: string;
  mode: AiMode;
}

interface EditResponse {
  updatedContent: string;
  summary: string;
  issues: string[];
}

interface DocumentRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  document_id: string;
  role: string;
  content: string;
  created_at: string;
}

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT =
  "You are EdgeTex Agent, an AI assistant for LaTeX and academic writing. The user is editing a LaTeX document. Follow the instruction while preserving valid LaTeX structure. Do not remove important content unless asked. Return JSON only with updatedContent, summary, and issues.";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "content-type"
};

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("EdgeTex Agent API is running.", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (parts[1] === "health" && request.method === "GET") {
      return jsonResponse({
        ok: true,
        bindings: {
          ai: Boolean(env.AI),
          aiRun: typeof env.AI?.run,
          db: Boolean(env.DB),
          assets: Boolean(env.ASSETS)
        }
      });
    }

    if (parts[1] === "ai" && parts[2] === "edit" && request.method === "POST") {
      return jsonResponse(await handleAiEdit(request, env));
    }

    if (parts[1] === "documents") {
      if (parts.length === 2 && request.method === "GET") {
        return jsonResponse(await listDocuments(env));
      }

      if (parts.length === 2 && request.method === "POST") {
        return jsonResponse(await createDocument(request, env), { status: 201 });
      }

      if (parts.length === 3 && request.method === "GET") {
        return jsonResponse(await getDocument(parts[2], env));
      }

      if (parts.length === 3 && request.method === "PUT") {
        return jsonResponse(await updateDocument(parts[2], request, env));
      }
    }

    if (parts[1] === "messages") {
      if (parts.length === 2 && request.method === "POST") {
        return jsonResponse(await createMessage(request, env), { status: 201 });
      }

      if (parts.length === 3 && request.method === "GET") {
        return jsonResponse(await listMessages(parts[2], env));
      }
    }

    throw new ApiError(404, "Route not found.");
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return jsonResponse(
      { error: "Unexpected server error. Check the Worker logs for details." },
      { status: 500 }
    );
  }
}

async function handleAiEdit(request: Request, env: Env): Promise<EditResponse> {
  const body = await readJson(request);
  const content = readString(body, "content");
  const instruction = readString(body, "instruction").trim();
  const documentId = readOptionalString(body, "documentId");
  const mode = readMode(body.mode);
  const normalizedInstruction = instruction || defaultInstruction(mode);

  const editRequest: EditRequest = {
    documentId,
    content,
    instruction: normalizedInstruction,
    mode
  };

  if (env.AI?.run) {
    try {
      const aiResult = await callWorkersAi(env.AI, editRequest);
      if (aiResult) {
        return aiResult;
      }

      return fallbackEdit(editRequest, "Workers AI returned an empty or invalid JSON response.");
    } catch (error) {
      console.warn("Workers AI edit failed, using deterministic fallback.", error);
      return fallbackEdit(editRequest, "Workers AI was unavailable or returned invalid JSON.");
    }
  }

  return fallbackEdit(editRequest, "Workers AI binding was not available in this environment.");
}

async function callWorkersAi(ai: WorkersAI, request: EditRequest): Promise<EditResponse | null> {
  const modeGuidance = getModeGuidance(request.mode);
  const prompt = [
    `Mode: ${request.mode}`,
    `Document ID: ${request.documentId || "not saved yet"}`,
    `Instruction: ${request.instruction}`,
    modeGuidance,
    "Return JSON only. The JSON shape must be:",
    '{"updatedContent":"...","summary":"...","issues":["..."]}',
    "Current LaTeX document:",
    "```latex",
    request.content,
    "```"
  ].join("\n");

  const result = await ai.run(MODEL, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 4096
  });

  const structured = parseStructuredEditResponse(result, request.content);
  if (structured) {
    return structured;
  }

  const text = extractAiText(result);
  if (!text) {
    return null;
  }

  return parseEditResponse(text, request.content);
}

function parseStructuredEditResponse(result: unknown, originalContent: string): EditResponse | null {
  if (!isRecord(result)) {
    return null;
  }

  if (looksLikeEditResponse(result)) {
    return normalizeEditResponse(result, originalContent);
  }

  for (const key of ["response", "result", "message", "content"]) {
    const value = result[key];
    const parsed = parseStructuredEditResponse(value, originalContent);
    if (parsed) {
      return parsed;
    }
  }

  const choices = result.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const parsed = parseStructuredEditResponse(choice, originalContent);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function looksLikeEditResponse(value: Record<string, unknown>): boolean {
  return "updatedContent" in value || "summary" in value || "issues" in value;
}

function getModeGuidance(mode: AiMode): string {
  if (mode === "review") {
    return "Review mode: do not rewrite the whole document unless needed. Focus on formatting, clarity, structure, possible LaTeX syntax issues, readability, and academic tone.";
  }

  if (mode === "fix") {
    return "Fix mode: fix obvious LaTeX syntax problems, preserve meaning, and explain what changed.";
  }

  if (mode === "academic") {
    return "Academic mode: make the prose more formal and scholarly while keeping the document structure intact.";
  }

  if (mode === "generate") {
    return "Generate mode: produce a coherent LaTeX document or section that follows the instruction.";
  }

  return "Improve mode: improve clarity, concision, and flow while preserving the user's content.";
}

async function listDocuments(env: Env) {
  const db = requireDb(env);
  const { results = [] } = await db
    .prepare(
      "SELECT id, title, content, created_at, updated_at FROM documents ORDER BY updated_at DESC"
    )
    .all<DocumentRow>();

  return { documents: results.map(toDocumentDto) };
}

async function createDocument(request: Request, env: Env) {
  const db = requireDb(env);
  const body = await readJson(request);
  const content = readString(body, "content");
  const title = cleanTitle(readOptionalString(body, "title") || inferTitle(content));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO documents (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, title, content, now, now)
    .run();

  return {
    document: {
      id,
      title,
      content,
      createdAt: now,
      updatedAt: now
    }
  };
}

async function getDocument(id: string, env: Env) {
  const db = requireDb(env);
  const row = await db
    .prepare("SELECT id, title, content, created_at, updated_at FROM documents WHERE id = ?")
    .bind(id)
    .first<DocumentRow>();

  if (!row) {
    throw new ApiError(404, "Document not found.");
  }

  return { document: toDocumentDto(row) };
}

async function updateDocument(id: string, request: Request, env: Env) {
  const db = requireDb(env);
  const existing = await db
    .prepare("SELECT id, title, content, created_at, updated_at FROM documents WHERE id = ?")
    .bind(id)
    .first<DocumentRow>();

  if (!existing) {
    throw new ApiError(404, "Document not found.");
  }

  const body = await readJson(request);
  const nextContent = body.content === undefined ? existing.content : readString(body, "content");
  const nextTitle = cleanTitle(readOptionalString(body, "title") || inferTitle(nextContent));
  const now = new Date().toISOString();

  await db
    .prepare("UPDATE documents SET title = ?, content = ?, updated_at = ? WHERE id = ?")
    .bind(nextTitle, nextContent, now, id)
    .run();

  return {
    document: {
      id,
      title: nextTitle,
      content: nextContent,
      createdAt: existing.created_at,
      updatedAt: now
    }
  };
}

async function createMessage(request: Request, env: Env) {
  const db = requireDb(env);
  const body = await readJson(request);
  const documentId = readString(body, "documentId").trim();
  const role = readRole(body.role);
  const content = readString(body, "content").trim();

  if (!documentId) {
    throw new ApiError(400, "documentId is required.");
  }

  if (!content) {
    throw new ApiError(400, "Message content is required.");
  }

  const document = await db
    .prepare("SELECT id FROM documents WHERE id = ?")
    .bind(documentId)
    .first<{ id: string }>();

  if (!document) {
    throw new ApiError(404, "Document not found for message.");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO messages (id, document_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, documentId, role, content, now)
    .run();

  return {
    message: {
      id,
      documentId,
      role,
      content,
      createdAt: now
    }
  };
}

async function listMessages(documentId: string, env: Env) {
  const db = requireDb(env);
  const { results = [] } = await db
    .prepare(
      "SELECT id, document_id, role, content, created_at FROM messages WHERE document_id = ? ORDER BY created_at ASC"
    )
    .bind(documentId)
    .all<MessageRow>();

  return { messages: results.map(toMessageDto) };
}

function requireDb(env: Env): D1Database {
  if (!env.DB) {
    throw new ApiError(503, "D1 binding DB is not configured.");
  }

  return env.DB;
}

function parseEditResponse(rawText: string, originalContent: string): EditResponse | null {
  const text = stripCodeFence(rawText);
  const candidates = [text, extractJsonObject(text)].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      return normalizeEditResponse(parsed, originalContent);
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeEditResponse(parsed: Record<string, unknown>, originalContent: string): EditResponse {
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.filter((issue): issue is string => typeof issue === "string")
    : [];

  let updatedContent =
    typeof parsed.updatedContent === "string" ? parsed.updatedContent : originalContent;

  if (originalContent.trim() && !updatedContent.trim()) {
    updatedContent = originalContent;
    issues.unshift("The AI returned empty content, so the original document was preserved.");
  }

  return {
    updatedContent,
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "AI edit completed.",
    issues
  };
}

function fallbackEdit(request: EditRequest, reason: string): EditResponse {
  const baseIssues = collectBasicIssues(request.content);
  const issues = [reason, ...baseIssues];

  if (request.mode === "generate") {
    return {
      updatedContent: generateLatexSkeleton(request.instruction),
      summary: "Generated a LaTeX article skeleton using the local deterministic fallback.",
      issues
    };
  }

  if (request.mode === "fix") {
    const fixed = fixLatexStructure(request.content || generateLatexSkeleton(request.instruction));
    return {
      updatedContent: fixed.content,
      summary: fixed.summary,
      issues: [...issues, ...fixed.issues]
    };
  }

  if (request.mode === "academic") {
    return {
      updatedContent: academicTonePass(request.content || generateLatexSkeleton(request.instruction)),
      summary: "Applied a conservative local academic-tone pass.",
      issues
    };
  }

  if (request.mode === "review") {
    return {
      updatedContent: request.content,
      summary: "Completed a lightweight local review. Enable Workers AI for deeper feedback.",
      issues: issues.length ? issues : ["No obvious local formatting issues were detected."]
    };
  }

  return {
    updatedContent: improveWritingPass(request.content || generateLatexSkeleton(request.instruction)),
    summary: "Applied a conservative local clarity pass.",
    issues
  };
}

function generateLatexSkeleton(instruction: string): string {
  const title = cleanTitle(instruction.replace(/^(generate|write|create)\s+/i, "")) || "Untitled Article";

  return [
    "\\documentclass{article}",
    "\\usepackage{amsmath}",
    "\\usepackage{graphicx}",
    "",
    `\\title{${escapeLatexTitle(title)}}`,
    "\\author{}",
    "\\date{}",
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
    "\\section{Introduction}",
    "This section introduces the topic, motivation, and central research question.",
    "",
    "\\section{Background}",
    "This section summarizes the relevant context and prior work.",
    "",
    "\\section{Method}",
    "This section describes the approach, assumptions, and materials used.",
    "",
    "\\section{Discussion}",
    "This section interprets the findings and explains their implications.",
    "",
    "\\section{Conclusion}",
    "This section summarizes the contribution and identifies future work.",
    "",
    "\\end{document}"
  ].join("\n");
}

function improveWritingPass(content: string): string {
  return content
    .replace(/\bvery\s+/gi, "")
    .replace(/\breally\s+/gi, "")
    .replace(/\ba lot of\b/gi, "many")
    .replace(/\butilize\b/gi, "use");
}

function academicTonePass(content: string): string {
  return improveWritingPass(content)
    .replace(/\bI think\b/gi, "This paper argues")
    .replace(/\bwe think\b/gi, "this work suggests")
    .replace(/\bgood\b/gi, "effective")
    .replace(/\bbad\b/gi, "problematic")
    .replace(/\bstuff\b/gi, "material");
}

function fixLatexStructure(content: string): { content: string; summary: string; issues: string[] } {
  const issues: string[] = [];
  let next = content.trim();

  if (!/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(next)) {
    next = `\\documentclass{article}\n\n${next}`;
    issues.push("Added a missing document class.");
  }

  if (!/\\begin\{document\}/.test(next)) {
    const lines = next.split("\n");
    let insertAt = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      if (
        !trimmed ||
        trimmed.startsWith("%") ||
        /^\\(documentclass|usepackage|title|author|date)\b/.test(trimmed)
      ) {
        insertAt = index + 1;
        continue;
      }
      break;
    }

    lines.splice(insertAt, 0, "\\begin{document}");
    next = lines.join("\n");
    issues.push("Added a missing \\begin{document}.");
  }

  if (!/\\end\{document\}/.test(next)) {
    next = `${next.replace(/\s+$/u, "")}\n\\end{document}`;
    issues.push("Added a missing \\end{document}.");
  }

  const braceDelta = countBraceDelta(next);
  if (braceDelta > 0) {
    next = `${next}${"}".repeat(braceDelta)}`;
    issues.push("Closed unmatched opening braces.");
  } else if (braceDelta < 0) {
    issues.push("Found more closing braces than opening braces; please inspect the affected command.");
  }

  return {
    content: next,
    summary: issues.length
      ? "Fixed obvious LaTeX structure issues using the local deterministic fallback."
      : "No obvious LaTeX structure changes were needed by the local fallback.",
    issues
  };
}

function collectBasicIssues(content: string): string[] {
  const issues: string[] = [];

  if (!content.trim()) {
    issues.push("The document is empty.");
    return issues;
  }

  if (!/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(content)) {
    issues.push("Missing \\documentclass declaration.");
  }

  if (!/\\begin\{document\}/.test(content)) {
    issues.push("Missing \\begin{document}.");
  }

  if (!/\\end\{document\}/.test(content)) {
    issues.push("Missing \\end{document}.");
  }

  if (!/\\section\{[^}]+\}/.test(content)) {
    issues.push("No section headings were detected.");
  }

  const braceDelta = countBraceDelta(content);
  if (braceDelta > 0) {
    issues.push("There are unmatched opening braces.");
  } else if (braceDelta < 0) {
    issues.push("There are unmatched closing braces.");
  }

  if (/\bTODO\b/i.test(content)) {
    issues.push("TODO markers remain in the document.");
  }

  return issues;
}

function countBraceDelta(content: string): number {
  let delta = 0;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const previous = content[index - 1];

    if (previous === "\\") {
      continue;
    }

    if (char === "{") {
      delta += 1;
    } else if (char === "}") {
      delta -= 1;
    }
  }

  return delta;
}

function extractAiText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (!isRecord(result)) {
    return "";
  }

  for (const key of ["response", "text", "content", "result"]) {
    const value = result[key];
    if (typeof value === "string") {
      return value;
    }
  }

  const nestedResult = result.result;
  if (nestedResult) {
    return extractAiText(nestedResult);
  }

  const choices = result.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const text = extractAiText(choice);
      if (text) {
        return text;
      }
    }
  }

  const message = result.message;
  if (message) {
    return extractAiText(message);
  }

  return "";
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }

  if (!isRecord(value)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }

  return value;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") {
    throw new ApiError(400, `${key} must be a string.`);
  }

  return value;
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ApiError(400, `${key} must be a string when provided.`);
  }

  return value;
}

function readMode(value: unknown): AiMode {
  if (
    value === "generate" ||
    value === "improve" ||
    value === "fix" ||
    value === "academic" ||
    value === "review"
  ) {
    return value;
  }

  throw new ApiError(400, "mode must be one of generate, improve, fix, academic, or review.");
}

function readRole(value: unknown): "user" | "assistant" | "system" {
  if (value === "user" || value === "assistant" || value === "system") {
    return value;
  }

  throw new ApiError(400, "role must be user, assistant, or system.");
}

function defaultInstruction(mode: AiMode): string {
  if (mode === "generate") {
    return "Generate a concise LaTeX article skeleton.";
  }

  if (mode === "fix") {
    return "Fix obvious LaTeX syntax problems while preserving meaning.";
  }

  if (mode === "academic") {
    return "Make the writing more academic while preserving the structure.";
  }

  if (mode === "review") {
    return "Review formatting, clarity, structure, LaTeX syntax, readability, and academic tone.";
  }

  return "Improve writing clarity and flow while preserving the document.";
}

function inferTitle(content: string): string {
  const titleMatch = content.match(/\\title\{([^}]+)\}/);
  if (titleMatch?.[1]) {
    return cleanTitle(titleMatch[1]);
  }

  const sectionMatch = content.match(/\\section\{([^}]+)\}/);
  if (sectionMatch?.[1]) {
    return cleanTitle(sectionMatch[1]);
  }

  return "Untitled LaTeX Document";
}

function cleanTitle(title: string): string {
  const cleaned = title.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "Untitled LaTeX Document";
}

function escapeLatexTitle(title: string): string {
  return title.replace(/[{}]/g, "").trim();
}

function toDocumentDto(row: DocumentRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toMessageDto(row: MessageRow) {
  return {
    id: row.id,
    documentId: row.document_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  };
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(JSON.stringify(data), { ...init, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
