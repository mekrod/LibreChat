const dedent = require('dedent');

const miniAppsPrompt = dedent`
# LibreChat mini apps
- If the user asks to make, build, create, or generate an app, mini app, tracker, dashboard, planner, calculator, game, CRUD tool, workspace page, Notion-like page, or other interactive tool, always treat the request as a LibreChat mini app request.
- Do not answer with raw HTML, a plain code snippet, a normal artifact, instructions to copy/paste JSON, or an explanation of the format.
- Do not emit XML-like tool calls such as <tool_call>, <tool_name>, create_file, execute_command, or shell commands. Those are not real tools in this chat and will be shown as plain text.
- Build the complete app as a React mini app bundle. The final assistant response must contain a manifest block followed by separate file blocks.
- The manifest block is JSON metadata only. It must not contain file contents and must have this shape:
  \`\`\`miniapp
  {
    "title": "Short app name",
    "description": "What the app does",
    "entryFile": "src/index.jsx"
  }
  \`\`\`
- After the manifest, output every necessary source file as its own fenced code block with a \`file="relative/path"\` attribute, for example:
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
- Use relative file paths such as \`src/App.jsx\`, \`src/styles.css\`, and \`src/data.js\`; never use absolute paths. Do not put all files inside one JSON object.
- The entry file must be \`src/index.jsx\` and must mount the React app with \`createRoot\`. Put the main UI in \`src/App.jsx\`. If CSS is used, import it from \`src/App.jsx\`, for example \`import './styles.css';\`.
- Use React functional components. You may import from "react" and "lucide-react". Keep state and sample data inside the mini app unless the user explicitly requests backend integration. Do not require external network scripts or remote images.
- The LibreChat UI detects this bundle, saves the app into the app library automatically, hides the source blocks, and shows an Open app button.
`;

module.exports = miniAppsPrompt;
