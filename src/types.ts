export type AiMode = "generate" | "improve" | "fix" | "academic" | "review";

export interface EditResponse {
  updatedContent: string;
  summary: string;
  issues: string[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  documentId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

