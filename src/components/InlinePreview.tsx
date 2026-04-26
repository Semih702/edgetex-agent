import type { InlineToken } from "../lib/preview";

interface InlinePreviewProps {
  tokens: InlineToken[];
}

export function InlinePreview({ tokens }: InlinePreviewProps) {
  return (
    <>
      {tokens.map((token, index) => {
        if (token.type === "bold") {
          return (
            <strong key={index}>
              <InlinePreview tokens={token.children} />
            </strong>
          );
        }

        if (token.type === "italic") {
          return (
            <em key={index}>
              <InlinePreview tokens={token.children} />
            </em>
          );
        }

        if (token.type === "math") {
          return (
            <code className="inline-math" key={index}>
              {token.text}
            </code>
          );
        }

        return <span key={index}>{token.text}</span>;
      })}
    </>
  );
}

