import {
  BookOpenCheck,
  GraduationCap,
  ListChecks,
  Save,
  Sparkles,
  Wand2,
  Wrench
} from "lucide-react";
import type { AiMode } from "../types";

interface ActionBarProps {
  mode: AiMode;
  isBusy: boolean;
  isSaving: boolean;
  isDirty: boolean;
  onModeChange: (mode: AiMode) => void;
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
  isBusy,
  isSaving,
  isDirty,
  onModeChange,
  onSave
}: ActionBarProps) {
  return (
    <div className="action-bar" aria-label="Document actions">
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

