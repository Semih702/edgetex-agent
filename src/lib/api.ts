import type { AiMode, ChatMessage, DocumentRecord, EditResponse } from "../types";

interface EditPayload {
  documentId?: string;
  content: string;
  instruction: string;
  mode: AiMode;
}

interface SaveDocumentPayload {
  title?: string;
  content: string;
}

interface CreateMessagePayload {
  documentId: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export async function editWithAi(payload: EditPayload): Promise<EditResponse> {
  return apiRequest<EditResponse>("/api/ai/edit", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listDocuments(): Promise<{ documents: DocumentRecord[] }> {
  return apiRequest<{ documents: DocumentRecord[] }>("/api/documents");
}

export async function createDocument(
  payload: SaveDocumentPayload
): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>("/api/documents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getDocument(id: string): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>(`/api/documents/${encodeURIComponent(id)}`);
}

export async function updateDocument(
  id: string,
  payload: SaveDocumentPayload
): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>(`/api/documents/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function createMessage(payload: CreateMessagePayload): Promise<{ message: ChatMessage }> {
  return apiRequest<{ message: ChatMessage }>("/api/messages", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getMessages(documentId: string): Promise<{ messages: ChatMessage[] }> {
  return apiRequest<{ messages: ChatMessage[] }>(
    `/api/messages/${encodeURIComponent(documentId)}`
  );
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      const text = await response.text();
      if (text) {
        message = text;
      }
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

