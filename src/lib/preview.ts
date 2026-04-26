export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineToken[] }
  | { type: "italic"; children: InlineToken[] }
  | { type: "math"; text: string };

export type PreviewBlock =
  | { id: string; type: "title" | "section" | "subsection" | "paragraph" | "meta"; tokens: InlineToken[] }
  | { id: string; type: "math"; text: string }
  | { id: string; type: "list"; items: InlineToken[][] };

export function parseLatexPreview(content: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  const paragraphLines: string[] = [];
  let listItems: InlineToken[][] = [];
  let inList = false;
  let blockId = 0;

  const nextId = () => `preview-${blockId++}`;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }

    blocks.push({
      id: nextId(),
      type: "paragraph",
      tokens: parseInline(paragraphLines.join(" "))
    });
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!listItems.length) {
      return;
    }

    blocks.push({
      id: nextId(),
      type: "list",
      items: listItems
    });
    listItems = [];
  };

  for (const rawLine of content.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line || line.startsWith("%")) {
      flushParagraph();
      continue;
    }

    if (/^\\begin\{itemize\}/.test(line)) {
      flushParagraph();
      inList = true;
      continue;
    }

    if (/^\\end\{itemize\}/.test(line)) {
      flushParagraph();
      flushList();
      inList = false;
      continue;
    }

    if (inList) {
      const item = line.replace(/^\\item\s*/u, "");
      listItems.push(parseInline(item));
      continue;
    }

    const title = readCommandArgument(line, "title");
    if (title) {
      flushParagraph();
      blocks.push({ id: nextId(), type: "title", tokens: parseInline(title) });
      continue;
    }

    const author = readCommandArgument(line, "author");
    if (author) {
      flushParagraph();
      blocks.push({ id: nextId(), type: "meta", tokens: parseInline(author) });
      continue;
    }

    const section = readCommandArgument(line, "section");
    if (section) {
      flushParagraph();
      blocks.push({ id: nextId(), type: "section", tokens: parseInline(section) });
      continue;
    }

    const subsection = readCommandArgument(line, "subsection");
    if (subsection) {
      flushParagraph();
      blocks.push({ id: nextId(), type: "subsection", tokens: parseInline(subsection) });
      continue;
    }

    const displayMath = readDisplayMath(line);
    if (displayMath) {
      flushParagraph();
      blocks.push({ id: nextId(), type: "math", text: displayMath });
      continue;
    }

    if (isPreambleOrBoundary(line)) {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  if (!blocks.length) {
    blocks.push({
      id: nextId(),
      type: "paragraph",
      tokens: parseInline("Start writing LaTeX to see a lightweight preview.")
    });
  }

  return blocks;
}

export function inferDocumentTitle(content: string): string {
  const title = content.match(/\\title\{([^}]+)\}/)?.[1];
  if (title) {
    return normalizeTitle(title);
  }

  const section = content.match(/\\section\{([^}]+)\}/)?.[1];
  if (section) {
    return normalizeTitle(section);
  }

  return "Untitled LaTeX Document";
}

export function parseInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let index = 0;

  while (index < input.length) {
    if (input.startsWith("\\textbf{", index)) {
      const value = readBalancedValue(input, index + "\\textbf".length);
      if (value) {
        tokens.push({ type: "bold", children: parseInline(value.value) });
        index = value.end;
        continue;
      }
    }

    if (input.startsWith("\\textit{", index) || input.startsWith("\\emph{", index)) {
      const commandLength = input.startsWith("\\emph{", index) ? "\\emph".length : "\\textit".length;
      const value = readBalancedValue(input, index + commandLength);
      if (value) {
        tokens.push({ type: "italic", children: parseInline(value.value) });
        index = value.end;
        continue;
      }
    }

    if (input[index] === "$") {
      const end = input.indexOf("$", index + 1);
      if (end > index) {
        tokens.push({ type: "math", text: input.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (input.startsWith("\\(", index)) {
      const end = input.indexOf("\\)", index + 2);
      if (end > index) {
        tokens.push({ type: "math", text: input.slice(index + 2, end) });
        index = end + 2;
        continue;
      }
    }

    const nextSpecial = findNextSpecial(input, index + 1);
    tokens.push({ type: "text", text: cleanText(input.slice(index, nextSpecial)) });
    index = nextSpecial;
  }

  return mergeTextTokens(tokens).filter((token) => token.type !== "text" || token.text.length > 0);
}

function findNextSpecial(input: string, start: number): number {
  const candidates = [
    input.indexOf("\\textbf{", start),
    input.indexOf("\\textit{", start),
    input.indexOf("\\emph{", start),
    input.indexOf("\\(", start),
    input.indexOf("$", start)
  ].filter((value) => value !== -1);

  return candidates.length ? Math.min(...candidates) : input.length;
}

function readCommandArgument(line: string, command: string): string | null {
  const prefix = `\\${command}{`;
  if (!line.startsWith(prefix)) {
    return null;
  }

  const value = readBalancedValue(line, prefix.length - 1);
  return value?.value ?? null;
}

function readBalancedValue(input: string, openBraceIndex: number): { value: string; end: number } | null {
  if (input[openBraceIndex] !== "{") {
    return null;
  }

  let depth = 0;
  for (let index = openBraceIndex; index < input.length; index += 1) {
    const char = input[index];
    const previous = input[index - 1];

    if (previous === "\\") {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          value: input.slice(openBraceIndex + 1, index),
          end: index + 1
        };
      }
    }
  }

  return null;
}

function readDisplayMath(line: string): string | null {
  if (line.startsWith("$$") && line.endsWith("$$")) {
    return line.slice(2, -2);
  }

  if (line.startsWith("\\[") && line.endsWith("\\]")) {
    return line.slice(2, -2);
  }

  return null;
}

function isPreambleOrBoundary(line: string): boolean {
  return /^\\(documentclass|usepackage|begin|end|maketitle|date)\b/.test(line);
}

function cleanText(text: string): string {
  return text
    .replace(/\\LaTeX\b/g, "LaTeX")
    .replace(/\\cite\{([^}]+)\}/g, "[cite: $1]")
    .replace(/\\ref\{([^}]+)\}/g, "[ref: $1]")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/\\_/g, "_")
    .replace(/~/g, " ")
    .replace(/\\\\/g, " ");
}

function mergeTextTokens(tokens: InlineToken[]): InlineToken[] {
  return tokens.reduce<InlineToken[]>((merged, token) => {
    const previous = merged[merged.length - 1];

    if (previous?.type === "text" && token.type === "text") {
      previous.text += token.text;
      return merged;
    }

    merged.push(token);
    return merged;
  }, []);
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled LaTeX Document";
}
