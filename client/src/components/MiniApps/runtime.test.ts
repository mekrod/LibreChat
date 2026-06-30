import { getSandpackRuntimeEntry, parseAnyMiniAppBundle, toSandpackFiles } from './runtime';

describe('parseAnyMiniAppBundle', () => {
  it('parses separated mini app manifest and file fences', () => {
    const bundle = parseAnyMiniAppBundle(`
\`\`\`miniapp
{
  "title": "Pomodoro Timer",
  "description": "A focused Pomodoro timer.",
  "entryFile": "src/App.jsx"
}
\`\`\`

\`\`\`jsx file="src/App.jsx"
import React from 'react';
import './styles.css';

export default function App() {
  return <main className="app">Pomodoro</main>;
}
\`\`\`

\`\`\`css file="src/styles.css"
.app {
  min-height: 100vh;
}
\`\`\`
`);

    expect(bundle).toMatchObject({
      title: 'Pomodoro Timer',
      description: 'A focused Pomodoro timer.',
      entryFile: 'src/App.jsx',
    });
    expect(bundle.files).toEqual({
      'src/App.jsx':
        "import React from 'react';\nimport './styles.css';\n\nexport default function App() {\n  return <main className=\"app\">Pomodoro</main>;\n}",
      'src/styles.css': '.app {\n  min-height: 100vh;\n}',
    });
  });

  it('does not parse a manifest-only mini app as saveable', () => {
    expect(() =>
      parseAnyMiniAppBundle(`
\`\`\`miniapp
{
  "title": "Pomodoro Timer",
  "entryFile": "src/App.jsx"
}
\`\`\`
`),
    ).toThrow('No mini app files found');
  });
});

describe('toSandpackFiles', () => {
  it('adds a Sandpack runtime entry for App.jsx-only bundles', () => {
    const files = toSandpackFiles(
      {
        'src/App.jsx': 'export default function App() { return <main>Pomodoro</main>; }',
        'src/styles.css': '.app { min-height: 100vh; }',
      },
      'src/App.jsx',
    );

    expect(files['/src/App.jsx']).toBe(
      'export default function App() { return <main>Pomodoro</main>; }',
    );
    expect(files['/src/index.js']).toContain("import App from './App.jsx';");
    expect(files['/src/index.js']).toContain('createRoot(root).render(<App />);');
    expect(getSandpackRuntimeEntry(files, 'src/App.jsx')).toBe('/src/index.js');
  });

  it('accepts stored file arrays from the API model', () => {
    const files = toSandpackFiles(
      [
        {
          path: 'src/App.jsx',
          content: 'export default function App() { return <main>Pomodoro</main>; }',
        },
        {
          path: 'src/styles.css',
          content: '.app { min-height: 100vh; }',
        },
      ],
      'src/App.jsx',
    );

    expect(files['/0']).toBeUndefined();
    expect(files['/1']).toBeUndefined();
    expect(files['/src/App.jsx']).toBe(
      'export default function App() { return <main>Pomodoro</main>; }',
    );
    expect(files['/src/styles.css']).toBe('.app { min-height: 100vh; }');
    expect(files['/src/index.js']).toContain("import App from './App.jsx';");
    expect(getSandpackRuntimeEntry(files, 'src/App.jsx')).toBe('/src/index.js');
  });

  it('uses the manifest entry file when the component is not named App', () => {
    const files = toSandpackFiles(
      {
        'src/Pomodoro.jsx': 'export default function Pomodoro() { return <main />; }',
      },
      'src/Pomodoro.jsx',
    );

    expect(files['/src/index.js']).toContain("import App from './Pomodoro.jsx';");
  });

  it('keeps an existing root runtime entry as the Sandpack entry', () => {
    const files = toSandpackFiles(
      {
        'index.jsx': 'import App from "./src/App.jsx";',
        'src/App.jsx': 'export default function App() { return <main />; }',
      },
      'index.jsx',
    );

    expect(files['/index.jsx']).toBe('import App from "./src/App.jsx";');
    expect(files['/src/index.js']).toBeUndefined();
    expect(getSandpackRuntimeEntry(files, 'index.jsx')).toBe('/index.jsx');
  });

  it('does not add a runtime entry when the bundle already has one', () => {
    const files = toSandpackFiles(
      {
        'src/App.jsx': 'export default function App() { return <main />; }',
        'src/index.jsx': 'custom runtime entry',
      },
      'src/App.jsx',
    );

    expect(files['/src/index.js']).toBeUndefined();
    expect(files['/src/index.jsx']).toBe('custom runtime entry');
    expect(getSandpackRuntimeEntry(files, 'src/index.jsx')).toBe('/src/index.jsx');
  });

  it('repairs runtime entries that use createRoot without importing it', () => {
    const files = toSandpackFiles(
      {
        'src/App.jsx': 'export default function App() { return <main />; }',
        'src/index.jsx': [
          "import React from 'react';",
          "import App from './App.jsx';",
          '',
          "createRoot(document.getElementById('root')).render(<App />);",
        ].join('\n'),
      },
      'src/index.jsx',
    );

    expect(files['/src/index.jsx']).toContain("import { createRoot } from 'react-dom/client';");
    expect(files['/src/index.jsx']).toContain('createRoot(document.getElementById');
  });
});
