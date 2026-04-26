import type { PreviewBlock } from "../lib/preview";
import { InlinePreview } from "./InlinePreview";

interface PreviewPanelProps {
  blocks: PreviewBlock[];
}

export function PreviewPanel({ blocks }: PreviewPanelProps) {
  return (
    <section className="panel preview-panel" aria-labelledby="preview-heading">
      <div className="panel-header">
        <h2 id="preview-heading">Preview</h2>
      </div>

      <article className="preview-document">
        {blocks.map((block) => {
          if (block.type === "title") {
            return (
              <h1 key={block.id}>
                <InlinePreview tokens={block.tokens} />
              </h1>
            );
          }

          if (block.type === "section") {
            return (
              <h2 key={block.id}>
                <InlinePreview tokens={block.tokens} />
              </h2>
            );
          }

          if (block.type === "subsection") {
            return (
              <h3 key={block.id}>
                <InlinePreview tokens={block.tokens} />
              </h3>
            );
          }

          if (block.type === "meta") {
            return (
              <p className="preview-meta" key={block.id}>
                <InlinePreview tokens={block.tokens} />
              </p>
            );
          }

          if (block.type === "math") {
            return (
              <pre className="display-math" key={block.id}>
                {block.text}
              </pre>
            );
          }

          if (block.type === "list") {
            return (
              <ul key={block.id}>
                {block.items.map((item, index) => (
                  <li key={index}>
                    <InlinePreview tokens={item} />
                  </li>
                ))}
              </ul>
            );
          }

          return (
            <p key={block.id}>
              <InlinePreview tokens={block.tokens} />
            </p>
          );
        })}
      </article>
    </section>
  );
}

