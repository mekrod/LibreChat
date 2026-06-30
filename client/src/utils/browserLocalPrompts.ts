import { AgentCapabilities, ArtifactModes } from 'librechat-data-provider';
import type { TSubmission } from 'librechat-data-provider';
import type { BrowserLocalChatMessage } from './browserLocalGemma';
import { isBrowserLocalMiniAppRequest } from './browserLocalMiniApps';

const browserLocalBasePrompt = `You are Gemma running locally in the user's browser inside LibreChat.
Treat the LibreChat instructions in this message as the highest-priority instructions for this turn.
Follow the user's instructions directly and be concise unless the task requires detail.
Only create a mini app when the user's latest message directly asks you to create, build, code, or generate an app-like interactive experience. Answer normal questions normally.`;

const browserLocalArtifactPrompt = `LibreChat can render artifacts when you wrap substantial standalone work in this exact format:

:::artifact{identifier="descriptive-kebab-case-id" type="mime-type" title="Short Title"}
\`\`\`
complete artifact content here
\`\`\`
:::

Use artifacts for self-contained websites, React components, SVGs, Mermaid diagrams, Markdown documents, and other substantial reusable content.

When the user asks to create, build, make, code, generate, or prototype a website, component, page, visualization, SVG, Mermaid diagram, or substantial document, treat that as a request for a complete artifact. Do not answer only with an explanation. Prefer a complete single-file HTML artifact with type "text/html" for websites, or a complete React component artifact with type "application/vnd.react" when React is requested. Always provide complete runnable content without placeholders, ellipses, or comments like "rest of code remains the same".

If the request is for an app, mini app, tracker, dashboard, planner, calculator, game, CRUD tool, workspace page, Notion-like page, or other interactive tool, follow the LibreChat mini app instructions instead of artifact instructions.`;

const browserLocalMiniAppsPrompt = `# LibreChat mini apps
- If the user asks to make, build, create, code, generate, or prototype an app, mini app, tracker, dashboard, planner, calculator, game, CRUD tool, workspace page, Notion-like page, or other interactive tool, always treat the request as a LibreChat mini app request.
- Do not answer with only a description, raw HTML, a plain code snippet, instructions to copy/paste, XML-like tool calls, create_file, execute_command, or shell commands.
- Build the complete app as a React mini app bundle. The final assistant response must contain a manifest block followed by separate file blocks.
- The manifest block is JSON metadata only. It must not contain file contents and must have this shape:
  \`\`\`miniapp
  {
    "title": "Short app name",
    "description": "What the app does",
    "entryFile": "src/index.jsx"
  }
  \`\`\`
- After the manifest, output every necessary source file as its own fenced code block with a file="relative/path" attribute, for example:
  \`\`\`jsx file="src/index.jsx"
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import App from './App.jsx';

  createRoot(document.getElementById('root')).render(<App />);
  \`\`\`
  \`\`\`jsx file="src/App.jsx"
  import './styles.css';
  export default function App() {
    return <main>Hello</main>;
  }
  \`\`\`
  \`\`\`css file="src/styles.css"
  main { min-height: 100vh; }
  \`\`\`
- Use relative file paths such as src/App.jsx, src/styles.css, and src/data.js; never use absolute paths.
- The entry file must be src/index.jsx and must mount the React app with createRoot. Put the main UI in src/App.jsx. If CSS is used, import it from src/App.jsx.
- Use React functional components. You may import from "react" and "lucide-react". Keep state and sample data inside the mini app unless the user explicitly requests backend integration. Do not require external network scripts or remote images.
- The LibreChat UI detects this bundle, saves the app into the app library automatically, hides the source blocks, and shows an Open app button.
- For app requests, output the mini app bundle immediately. Do not apologize, do not say you cannot create apps, and do not ask the user to confirm the format.`;

const shadcnArtifactPrompt = `When using shadcn/ui in React artifacts, import components from "/components/ui/name". Do not import from "@/components/ui/name" or "/components/name".`;

function getArtifactPrompt(submission: TSubmission): string | null {
  const artifacts = submission.ephemeralAgent?.[AgentCapabilities.artifacts];
  if (typeof artifacts !== 'string' || artifacts.length === 0) {
    return null;
  }

  if (artifacts === ArtifactModes.SHADCNUI) {
    return `${browserLocalArtifactPrompt}\n\n${shadcnArtifactPrompt}`;
  }

  return browserLocalArtifactPrompt;
}

export function buildBrowserLocalSystemMessage(
  submission: TSubmission,
): BrowserLocalChatMessage | null {
  const includeMiniAppsPrompt = isBrowserLocalMiniAppRequest(submission.userMessage.text);
  const parts = [
    browserLocalBasePrompt,
    submission.conversation?.promptPrefix,
    includeMiniAppsPrompt ? browserLocalMiniAppsPrompt : null,
    getArtifactPrompt(submission),
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

  if (parts.length === 0) {
    return null;
  }

  return {
    role: 'system',
    content: parts.join('\n\n'),
  };
}
