import { SendHorizontal } from "lucide-react";
import type { AiMode, ChatMessage } from "../types";

interface ChatPanelProps {
  mode: AiMode;
  messages: ChatMessage[];
  instruction: string;
  isBusy: boolean;
  onInstructionChange: (value: string) => void;
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
  onSend
}: ChatPanelProps) {
  return (
    <section className="panel chat-panel" aria-labelledby="chat-heading">
      <div className="panel-header">
        <h2 id="chat-heading">Assistant</h2>
        <span className="mode-pill">{modeLabel[mode]}</span>
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
              <p>{message.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="chat-input-row">
        <textarea
          aria-label="Assistant instruction"
          onChange={(event) => onInstructionChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              onSend();
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

