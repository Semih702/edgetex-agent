import {
  BookOpenCheck,
  Download,
  FilePlus2,
  GraduationCap,
  ListChecks,
  Save,
  Sparkles,
  Upload,
  Wand2,
  Wrench
} from "lucide-react";
import type { AiMode, DocumentRecord } from "../types";

interface ActionBarProps {
  mode: AiMode;
  documentId: string | null;
  documents: DocumentRecord[];
  isBusy: boolean;
  isSaving: boolean;
  isDirty: boolean;
  onModeChange: (mode: AiMode) => void;
  onNewDocument: () => void;
  onOpenDocument: (id: string) => void;
  onImportDocument: (file: File) => void;
  onDownloadDocument: () => void;
  onSave: () => void;
}

const actions = [
  { mode: "generate" as const, label: "Generate LaTeX", icon: Wand2 },
  { mode: "improve" as const, label: "Improve Writing", icon: Sparkles },
  { mode: "fix" as const, label: "Fix LaTeX", icon: Wrench },
  { mode: "academic" as const, label: "Make Academic", icon: GraduationCap },
  { mode: "review" as const, label: "Review Formatting", icon: ListChecks }
];

export function ActionBar({
  mode,
  documentId,
  documents,
  isBusy,
  isSaving,
  isDirty,
  onModeChange,
  onNewDocument,
  onOpenDocument,
  onImportDocument,
  onDownloadDocument,
  onSave
}: ActionBarProps) {
  return (
    <div className="action-bar" aria-label="Document actions">
      <div className="file-group" aria-label="File actions">
        <button
          className="tool-button"
          disabled={isBusy || isSaving}
          onClick={onNewDocument}
          title="New Document"
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={16} />
          <span>New</span>
        </button>

        <label className="tool-button import-button" title="Import .tex">
          <Upload aria-hidden="true" size={16} />
          <span>Import .tex</span>
          <input
            accept=".tex,text/plain"
            disabled={isBusy || isSaving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImportDocument(file);
              }
              event.target.value = "";
            }}
            type="file"
          />
        </label>

        <button
          className="tool-button"
          onClick={onDownloadDocument}
          title="Download .tex"
          type="button"
        >
          <Download aria-hidden="true" size={16} />
          <span>Download .tex</span>
        </button>

        <select
          aria-label="Open saved document"
          className="document-select"
          disabled={documents.length === 0 || isBusy || isSaving}
          onChange={(event) => {
            if (event.target.value) {
              onOpenDocument(event.target.value);
            }
          }}
          value={documentId ?? ""}
        >
          <option value="">Open saved...</option>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title}
            </option>
          ))}
        </select>
      </div>

      <div className="action-group" role="group" aria-label="AI edit modes">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              className={action.mode === mode ? "tool-button selected" : "tool-button"}
              disabled={isBusy}
              key={action.mode}
              onClick={() => onModeChange(action.mode)}
              title={action.label}
              type="button"
            >
              <Icon aria-hidden="true" size={16} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>

      <button
        className="save-button"
        disabled={isSaving}
        onClick={onSave}
        title="Save Document"
        type="button"
      >
        {isSaving ? (
          <BookOpenCheck aria-hidden="true" size={16} />
        ) : (
          <Save aria-hidden="true" size={16} />
        )}
        <span>{isSaving ? "Saving" : isDirty ? "Save Document" : "Saved"}</span>
      </button>
    </div>
  );
}
