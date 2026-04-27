import { useEffect, useMemo, useState } from "react";
import { ActionBar } from "./components/ActionBar";
import { ChatPanel } from "./components/ChatPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { EditorPanel } from "./components/EditorPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import {
  createDocument,
  deleteMessages,
  createMessage,
  editWithAi,
  getDocument,
  getMessages,
  listDocuments,
  updateDocument
} from "./lib/api";
import { downloadTexFile, exportPreviewPdf } from "./lib/export";
import { inferDocumentTitle, parseLatexPreview } from "./lib/preview";
import type { AiMode, ChatMessage, DocumentRecord, EditResponse } from "./types";

const LAST_DOCUMENT_KEY = "edgetex:last-document-id";

const DEFAULT_DOCUMENT = String.raw`\documentclass{article}
\usepackage{amsmath}
\usepackage{graphicx}

\title{Edge Computing for Scientific Collaboration}
\author{EdgeTex Agent}
\date{}

\begin{document}
\maketitle

\section{Introduction}
Cloudflare Workers make it possible to build lightweight applications close to users. This draft explores how an AI-assisted LaTeX editor can support academic writing without becoming a full compilation environment.

\subsection{Motivation}
Researchers often need help turning rough notes into structured prose. An editor that combines direct LaTeX editing with a chat workflow can help users generate sections, improve tone, and catch formatting issues.

\section{Approach}
The system stores documents and chat history in D1, routes edit requests through a Worker, and uses Workers AI when it is available. Inline math such as $E = mc^2$ is shown as a lightweight text preview.

\section{Conclusion}
EdgeTex Agent focuses on fast AI-assisted drafting and review while leaving full PDF compilation outside the MVP scope.

\end{document}`;

const modePrefix: Record<AiMode, string> = {
  generate: "Generate LaTeX",
  improve: "Improve Writing",
  fix: "Fix LaTeX",
  academic: "Make Academic",
  review: "Review Formatting"
};

interface ConfirmationState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  resolve: (confirmed: boolean) => void;
}

function App() {
  const [content, setContent] = useState(DEFAULT_DOCUMENT);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState("Sample Document");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [instruction, setInstruction] = useState("");
  const [mode, setMode] = useState<AiMode>("improve");
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(true);
  const [status, setStatus] = useState("Sample loaded");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);

  const previewBlocks = useMemo(() => parseLatexPreview(content), [content]);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      try {
        const { documents } = await listDocuments();
        setDocuments(documents);
        const lastId = window.localStorage.getItem(LAST_DOCUMENT_KEY);
        const selected = documents.find((document) => document.id === lastId) ?? documents[0];

        if (!selected || ignore) {
          return;
        }

        const { document } = await getDocument(selected.id);
        const { messages: savedMessages } = await getMessages(selected.id);

        if (ignore) {
          return;
        }

        applyDocument(document);
        setMessages(savedMessages);
        setIsDirty(false);
        setStatus("Loaded saved document");
      } catch (bootError) {
        if (!ignore) {
          setStatus("Sample loaded");
          setError(readErrorMessage(bootError, "Could not load saved documents."));
        }
      }
    }

    void boot();

    return () => {
      ignore = true;
    };
  }, []);

  function applyDocument(document: DocumentRecord) {
    setDocumentId(document.id);
    setDocumentTitle(document.title);
    setContent(document.content);
    setDocuments((current) => upsertDocument(current, document));
    window.localStorage.setItem(LAST_DOCUMENT_KEY, document.id);
  }

  function handleContentChange(nextContent: string) {
    setContent(nextContent);
    setDocumentTitle(inferDocumentTitle(nextContent));
    setIsDirty(true);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);

    try {
      const title = inferDocumentTitle(content);
      const result = documentId
        ? await updateDocument(documentId, { title, content })
        : await createDocument({ title, content });

      applyDocument(result.document);
      setIsDirty(false);
      setStatus("Document saved");
    } catch (saveError) {
      setError(readErrorMessage(saveError, "Could not save document."));
    } finally {
      setIsSaving(false);
    }
  }

  async function ensureSavedDocument(): Promise<string> {
    if (documentId) {
      return documentId;
    }

    const title = inferDocumentTitle(content);
    const { document } = await createDocument({ title, content });
    applyDocument(document);
    setIsDirty(false);
    return document.id;
  }

  function requestConfirmation(
    options: Omit<ConfirmationState, "resolve">
  ): Promise<boolean> {
    return new Promise((resolve) => {
      setConfirmation({ ...options, resolve });
    });
  }

  function closeConfirmation(confirmed: boolean) {
    const current = confirmation;
    setConfirmation(null);
    current?.resolve(confirmed);
  }

  async function handleOpenDocument(nextDocumentId: string) {
    if (nextDocumentId === documentId) {
      return;
    }

    if (isDirty) {
      const confirmed = await requestConfirmation({
        title: "Open saved document?",
        message: "You have unsaved changes in the current document. Opening another document will discard them.",
        confirmLabel: "Open document"
      });

      if (!confirmed) {
        return;
      }
    }

    setError(null);
    setStatus("Loading document");

    try {
      const [{ document }, { messages: savedMessages }] = await Promise.all([
        getDocument(nextDocumentId),
        getMessages(nextDocumentId)
      ]);

      applyDocument(document);
      setMessages(savedMessages);
      setInstruction("");
      setIsDirty(false);
      setStatus("Loaded saved document");
    } catch (openError) {
      setError(readErrorMessage(openError, "Could not open document."));
      setStatus("Open failed");
    }
  }

  async function handleNewDocument() {
    if (isDirty) {
      const confirmed = await requestConfirmation({
        title: "Create new document?",
        message: "You have unsaved changes. Starting a new document will discard the current draft.",
        confirmLabel: "Create new"
      });

      if (!confirmed) {
        return;
      }
    }

    setContent(createNewDocumentTemplate());
    setDocumentId(null);
    setDocumentTitle("Untitled LaTeX Document");
    setMessages([]);
    setInstruction("");
    setIsDirty(true);
    setError(null);
    setStatus("New document");
    window.localStorage.removeItem(LAST_DOCUMENT_KEY);
  }

  async function handleImportDocument(file: File) {
    if (isDirty) {
      const confirmed = await requestConfirmation({
        title: "Import file?",
        message: "You have unsaved changes. Importing this file will replace the current editor contents.",
        confirmLabel: "Import file"
      });

      if (!confirmed) {
        return;
      }
    }

    try {
      const importedContent = await file.text();
      const importedTitle = inferDocumentTitle(importedContent);
      setContent(importedContent);
      setDocumentId(null);
      setDocumentTitle(
        importedTitle === "Untitled LaTeX Document" ? stripExtension(file.name) : importedTitle
      );
      setMessages([]);
      setInstruction("");
      setIsDirty(true);
      setError(null);
      setStatus(`Imported ${file.name}`);
      window.localStorage.removeItem(LAST_DOCUMENT_KEY);
    } catch (importError) {
      setError(readErrorMessage(importError, "Could not import file."));
    }
  }

  function handleDownloadDocument() {
    const title = inferDocumentTitle(content);
    const fileName = downloadTexFile(content, title);
    setStatus(`Downloaded ${fileName}`);
  }

  function handleExportPdf() {
    setError(null);

    try {
      const title = inferDocumentTitle(content);
      const fileName = exportPreviewPdf(content, title);
      setStatus(`Preparing ${fileName}`);
    } catch (pdfError) {
      setError(readErrorMessage(pdfError, "Could not export PDF."));
    }
  }

  async function handleSend() {
    const cleanInstruction = instruction.trim() || defaultInstruction(mode);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: `${modePrefix[mode]}: ${cleanInstruction}`,
      createdAt: new Date().toISOString()
    };

    setIsBusy(true);
    setError(null);
    setInstruction("");
    setMessages((current) => [...current, userMessage]);

    try {
      const savedDocumentId = await ensureSavedDocument();
      await createMessage({
        documentId: savedDocumentId,
        role: "user",
        content: userMessage.content
      });

      const response = await editWithAi({
        documentId: savedDocumentId,
        content,
        instruction: cleanInstruction,
        mode
      });

      if (response.updatedContent) {
        setContent(response.updatedContent);
        setDocumentTitle(inferDocumentTitle(response.updatedContent));
        setIsDirty(true);
      }

      const assistantContent = formatAssistantResponse(response);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        documentId: savedDocumentId,
        role: "assistant",
        content: assistantContent,
        createdAt: new Date().toISOString()
      };

      setMessages((current) => [...current, assistantMessage]);
      await createMessage({
        documentId: savedDocumentId,
        role: "assistant",
        content: assistantContent
      });

      setStatus("AI edit complete");
    } catch (sendError) {
      setError(readErrorMessage(sendError, "Could not complete the AI edit."));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClearMessages() {
    if (messages.length === 0) {
      return;
    }

    const confirmed = await requestConfirmation({
      title: "Clear chat history?",
      message: "This will remove the assistant conversation for this document. The LaTeX document itself will not change.",
      confirmLabel: "Clear chat",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    setError(null);

    if (!documentId) {
      setMessages([]);
      setStatus("Chat cleared");
      return;
    }

    try {
      await deleteMessages(documentId);
      setMessages([]);
      setStatus("Chat cleared");
    } catch (clearError) {
      setError(readErrorMessage(clearError, "Could not clear chat."));
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>EdgeTex Agent</h1>
        </div>
        <div className="status-stack">
          <span className={isDirty ? "status-dot dirty" : "status-dot"} />
          <span>{status}</span>
        </div>
      </header>

      <ActionBar
        documentId={documentId}
        documents={documents}
        isBusy={isBusy}
        isDirty={isDirty}
        isSaving={isSaving}
        mode={mode}
        onDownloadDocument={handleDownloadDocument}
        onExportPdf={handleExportPdf}
        onImportDocument={handleImportDocument}
        onModeChange={setMode}
        onNewDocument={handleNewDocument}
        onOpenDocument={handleOpenDocument}
        onSave={handleSave}
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="workspace-grid">
        <EditorPanel content={content} onChange={handleContentChange} />
        <PreviewPanel blocks={previewBlocks} />
        <ChatPanel
          instruction={instruction}
          isBusy={isBusy}
          messages={messages}
          mode={mode}
          onClearMessages={handleClearMessages}
          onInstructionChange={setInstruction}
          onSend={handleSend}
        />
      </main>

      {confirmation ? (
        <ConfirmDialog
          cancelLabel={confirmation.cancelLabel}
          confirmLabel={confirmation.confirmLabel}
          message={confirmation.message}
          onCancel={() => closeConfirmation(false)}
          onConfirm={() => closeConfirmation(true)}
          title={confirmation.title}
          tone={confirmation.tone}
        />
      ) : null}
    </div>
  );
}

function formatAssistantResponse(response: EditResponse): string {
  return JSON.stringify({
    kind: "edgetex-ai-response",
    summary: response.summary,
    issues: response.issues
  });
}

function defaultInstruction(mode: AiMode): string {
  if (mode === "generate") {
    return "Generate a concise LaTeX article skeleton.";
  }

  if (mode === "fix") {
    return "Fix obvious LaTeX syntax problems while preserving meaning.";
  }

  if (mode === "academic") {
    return "Make the writing more academic while preserving structure.";
  }

  if (mode === "review") {
    return "Review formatting, clarity, structure, LaTeX syntax, readability, and academic tone.";
  }

  return "Improve writing clarity and flow while preserving the document.";
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createNewDocumentTemplate(): string {
  return String.raw`\documentclass{article}
\usepackage{amsmath}

\title{Untitled LaTeX Document}
\author{}
\date{}

\begin{document}
\maketitle

\section{Introduction}
Start writing here.

\end{document}`;
}

function upsertDocument(documents: DocumentRecord[], document: DocumentRecord): DocumentRecord[] {
  const next = documents.filter((item) => item.id !== document.id);
  return [document, ...next].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, "");
}

export default App;
