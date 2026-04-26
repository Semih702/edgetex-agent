interface EditorPanelProps {
  content: string;
  onChange: (value: string) => void;
}

export function EditorPanel({ content, onChange }: EditorPanelProps) {
  return (
    <section className="panel editor-panel" aria-labelledby="editor-heading">
      <div className="panel-header">
        <h2 id="editor-heading">LaTeX</h2>
      </div>
      <textarea
        aria-label="LaTeX editor"
        className="latex-editor"
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={content}
      />
    </section>
  );
}

