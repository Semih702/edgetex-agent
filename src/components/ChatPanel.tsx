import { CheckCircle2, CircleAlert, SendHorizontal, Trash2 } from "lucide-react";
import type { AiMode, ChatMessage } from "../types";

interface ChatPanelProps {
  mode: AiMode;
  messages: ChatMessage[];
  instruction: string;
  isBusy: boolean;
  onInstructionChange: (value: string) => void;
  onClearMessages: () => void;
  onSend: () => void;
}

const modeLabel: Record<AiMode, string> = {
  generate: "Generate LaTeX",
  improve: "Improve Writing",
  fix: "Fix LaTeX",
  academic: "Make Academic",
  review: "Review Formatting"
};

export function ChatPanel({
  mode,
  messages,
  instruction,
  isBusy,
  onInstructionChange,
  onClearMessages,
  onSend
}: ChatPanelProps) {
  return (
    <section className="panel chat-panel" aria-labelledby="chat-heading">
      <div className="panel-header">
        <h2 id="chat-heading">Assistant</h2>
        <div className="chat-header-actions">
          <button
            aria-label="Clear chat"
            className="icon-button"
            disabled={isBusy || messages.length === 0}
            onClick={onClearMessages}
            title="Clear chat"
            type="button"
          >
            <Trash2 aria-hidden="true" size={15} />
          </button>
          <span className="mode-pill">{modeLabel[mode]}</span>
        </div>
      </div>

      <div className="message-list" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-chat">
            Ask for a section draft, tone pass, syntax fix, or formatting review.
          </div>
        ) : (
          messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              <span className="message-role">{message.role}</span>
              <MessageContent message={message} />
            </div>
          ))
        )}
      </div>

      <div className="chat-input-row">
        <textarea
          aria-label="Assistant instruction"
          onChange={(event) => onInstructionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!isBusy) {
                onSend();
              }
            }
          }}
          placeholder="Describe the edit..."
          value={instruction}
        />
        <button
          className="send-button"
          disabled={isBusy}
          onClick={onSend}
          title="Send"
          type="button"
        >
          <SendHorizontal aria-hidden="true" size={18} />
          <span>{isBusy ? "Working" : "Send"}</span>
        </button>
      </div>
    </section>
  );
}

function MessageContent({ message }: { message: ChatMessage }) {
  if (message.role !== "assistant") {
    return <p>{message.content}</p>;
  }

  const response = parseAssistantResponse(message.content);
  if (!response) {
    return <p>{message.content}</p>;
  }

  return (
    <div className="assistant-response">
      <p>{response.summary}</p>
      {response.issues.length > 0 ? (
        <div className="issues-block">
          <div className="issues-heading">
            <CircleAlert aria-hidden="true" size={15} />
            <span>Issues</span>
          </div>
          <ul>
            {response.issues.map((issue, index) => (
              <li key={`${issue}-${index}`}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="no-issues">
          <CheckCircle2 aria-hidden="true" size={15} />
          <span>No issues found</span>
        </div>
      )}
    </div>
  );
}

function parseAssistantResponse(content: string): { summary: string; issues: string[] } | null {
  try {
    const parsed = JSON.parse(content) as {
      kind?: string;
      summary?: unknown;
      issues?: unknown;
    };

    if (parsed.kind === "edgetex-ai-response" && typeof parsed.summary === "string") {
      return {
        summary: parsed.summary,
        issues: normalizeIssues(parsed.issues)
      };
    }
  } catch {
    // Older saved messages were stored as plain text; parse them below.
  }

  const legacyMatch = content.match(/^(?<summary>[\s\S]*?)\nIssues:\n(?<issues>[\s\S]*)$/u);
  if (!legacyMatch?.groups) {
    return null;
  }

  const issues = legacyMatch.groups.issues
    .split("\n")
    .map((issue) => issue.replace(/^-\s*/u, "").trim())
    .filter((issue) => issue && !/^none reported\.?$/iu.test(issue));

  return {
    summary: legacyMatch.groups.summary.trim(),
    issues
  };
}

function normalizeIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((issue): issue is string => typeof issue === "string")
    .map((issue) => issue.trim())
    .filter(Boolean);
}
