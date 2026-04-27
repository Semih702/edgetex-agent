# EdgeTex Agent

EdgeTex Agent is a lightweight AI-assisted LaTeX editor for the Cloudflare AI app assignment. It gives users a small Overleaf-style workspace with a LaTeX editor, a lightweight HTML preview, and a chat assistant that can generate, improve, fix, academicize, and review LaTeX documents through Cloudflare Worker API routes.

## Project Notes

I built this as a focused MVP rather than a full Overleaf clone. The main goal was to show a practical Cloudflare AI workflow: a user edits LaTeX, asks the assistant for a change, the Worker coordinates the request, Workers AI returns a structured edit, and D1 keeps the document and chat history around between sessions.

I also spent time on the small product details that make the app feel usable: separating file actions from AI actions, adding import/download/export controls, keeping the three-pane editor inside one desktop viewport, replacing browser confirms with an in-app confirmation dialog, and adding a clear-chat action for the assistant panel.

## Assignment Alignment

- LLM: Cloudflare Workers AI through the `AI` binding.
- Workflow / coordination: Cloudflare Worker API routes orchestrate edit requests, JSON parsing, fallbacks, document persistence, and chat history.
- User input: React + Vite editor, preview, action buttons, and chat UI.
- Memory/state: Cloudflare D1 stores documents, chat messages, and preferences.
- CI/CD: GitHub Actions runs the build and deploys the Worker on `main` pushes.

## Features

- Single-page React editor named EdgeTex Agent.
- Left LaTeX editor, right lightweight preview, and assistant panel.
- Actions for Generate LaTeX, Improve Writing, Fix LaTeX, Make Academic, Review Formatting, and Save Document.
- Document controls for creating a new document, opening saved D1 documents, importing `.tex` files, downloading `.tex`, and exporting the lightweight preview as PDF through the browser print flow.
- Workers AI route with a strict JSON prompt and safe JSON parsing.
- Deterministic local fallback when Workers AI is unavailable.
- D1-backed document save/load and chat history.
- Assistant chat history can be cleared per document.
- Lightweight preview for `\title{}`, `\section{}`, `\subsection{}`, `\textbf{}`, `\textit{}`, item lists, and simple inline/display math.
- Responsive, single-screen desktop layout with separate tinted editor and assistant panels.

## Architecture

```text
User
  |
  v
React + Vite UI
  |  editor input, action mode, chat instruction
  v
Cloudflare Worker API
  |-- POST /api/ai/edit ----> Workers AI binding
  |                            |
  |<--------- JSON edit response
  |
  |-- /api/documents --------> D1 documents table
  |-- /api/messages ---------> D1 messages table
  |
  v
Updated editor, preview, and chat summary
```

## Local Development

```bash
npm install
npm run db:migrate:local
npm run dev
```

The Vite app runs on `http://localhost:5173` and proxies `/api/*` to Wrangler on `http://localhost:8787`. The app includes a default sample LaTeX document on first launch.

Workers AI may not run in local Wrangler mode, depending on the environment. The Worker includes a deterministic fallback so the UI remains testable locally.

## Cloudflare Setup

```bash
npm install
npx wrangler login
npx wrangler d1 create edgetex-db
```

Copy the returned `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "edgetex-db"
database_id = "REPLACE_WITH_YOUR_DATABASE_ID"
```

Apply migrations:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Run and deploy:

```bash
npm run dev
npm run deploy
```

Workers AI is configured with:

```toml
[ai]
binding = "AI"
```

## CI/CD

The repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.

- Pull requests run `npm ci` and `npm run build`.
- Pushes to `main` run the same build and then deploy with Wrangler.
- Deployment uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub repository secrets.

## API Routes

- `POST /api/ai/edit`
- `POST /api/documents`
- `GET /api/documents/:id`
- `PUT /api/documents/:id`
- `GET /api/documents`
- `POST /api/messages`
- `GET /api/messages/:documentId`
- `DELETE /api/messages/:documentId`

## Example Use Cases

- Generate a LaTeX article skeleton from a short prompt.
- Make a section more academic.
- Fix obvious LaTeX syntax problems.
- Review formatting, clarity, and structure.
- Turn rough notes into a structured LaTeX document.

## Limitations

- EdgeTex Agent is not a full LaTeX compiler.
- The preview is a lightweight HTML preview only, not a PDF renderer.
- PDF export uses the lightweight preview and browser print dialog; it is not full LaTeX compilation.
- No authentication is included in this MVP.
- The local AI fallback is deterministic and intentionally conservative.

## Future Work

- Full PDF compilation through an external service or WASM.
- Collaborative editing.
- Visual PDF review.
- Cloudflare Workflows for longer multi-step document processing.
- R2 for storing generated files.
- More advanced prompt-injection safeguards.
