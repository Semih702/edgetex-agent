import type { InlineToken, PreviewBlock } from "./preview";
import { parseLatexPreview } from "./preview";

export function downloadTexFile(content: string, title: string): string {
  const fileName = `${slugify(title)}.tex`;
  const blob = new Blob([content], { type: "application/x-tex;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return fileName;
}

export function exportPreviewPdf(content: string, title: string): string {
  const fileName = `${slugify(title)}.pdf`;
  const printWindow = window.open("", "_blank", "width=920,height=720");

  if (!printWindow) {
    throw new Error("Could not open the PDF export window. Please allow pop-ups for this site.");
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintableHtml(content, title));
  printWindow.document.close();
  printWindow.focus();

  window.setTimeout(() => {
    printWindow.print();
  }, 250);

  return fileName;
}

function buildPrintableHtml(content: string, title: string): string {
  const blocks = parseLatexPreview(content);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { margin: 0.75in; }
      * { box-sizing: border-box; }
      body {
        color: #22252b;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 12pt;
        line-height: 1.55;
        margin: 0;
      }
      h1 {
        border-bottom: 1px solid #d7d7d7;
        font-size: 22pt;
        line-height: 1.2;
        margin: 0 0 18pt;
        padding-bottom: 10pt;
      }
      h2 {
        font-size: 16pt;
        margin: 20pt 0 7pt;
      }
      h3 {
        font-size: 13pt;
        margin: 14pt 0 6pt;
      }
      p { margin: 0 0 10pt; }
      ul { margin: 0 0 10pt; padding-left: 20pt; }
      code {
        background: #f3f3f3;
        border: 1px solid #dddddd;
        border-radius: 4px;
        font-family: "Courier New", monospace;
        font-size: 0.9em;
        padding: 1px 4px;
      }
      pre {
        background: #f6f6f6;
        border: 1px solid #dddddd;
        border-radius: 6px;
        font-family: "Courier New", monospace;
        padding: 10pt;
        white-space: pre-wrap;
      }
      .meta { color: #666666; font-size: 10.5pt; }
      .note {
        border-top: 1px solid #dddddd;
        color: #666666;
        font-family: Arial, sans-serif;
        font-size: 8.5pt;
        margin-top: 28pt;
        padding-top: 8pt;
      }
    </style>
  </head>
  <body>
    ${blocks.map(renderBlock).join("\n")}
    <p class="note">Exported from EdgeTex Agent lightweight preview. This is not a full LaTeX compiler output.</p>
  </body>
</html>`;
}

function renderBlock(block: PreviewBlock): string {
  if (block.type === "title") {
    return `<h1>${renderTokens(block.tokens)}</h1>`;
  }

  if (block.type === "section") {
    return `<h2>${renderTokens(block.tokens)}</h2>`;
  }

  if (block.type === "subsection") {
    return `<h3>${renderTokens(block.tokens)}</h3>`;
  }

  if (block.type === "meta") {
    return `<p class="meta">${renderTokens(block.tokens)}</p>`;
  }

  if (block.type === "math") {
    return `<pre>${escapeHtml(block.text)}</pre>`;
  }

  if (block.type === "list") {
    return `<ul>${block.items.map((item) => `<li>${renderTokens(item)}</li>`).join("")}</ul>`;
  }

  return `<p>${renderTokens(block.tokens)}</p>`;
}

function renderTokens(tokens: InlineToken[]): string {
  return tokens
    .map((token) => {
      if (token.type === "bold") {
        return `<strong>${renderTokens(token.children)}</strong>`;
      }

      if (token.type === "italic") {
        return `<em>${renderTokens(token.children)}</em>`;
      }

      if (token.type === "math") {
        return `<code>${escapeHtml(token.text)}</code>`;
      }

      return escapeHtml(token.text);
    })
    .join("");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "edgetex-document";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

