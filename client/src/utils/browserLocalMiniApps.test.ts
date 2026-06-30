import {
  hasBrowserLocalMiniAppBundle,
  isBrowserLocalMiniAppRequest,
  normalizeBrowserLocalMiniAppResponse,
} from './browserLocalMiniApps';

describe('isBrowserLocalMiniAppRequest', () => {
  it('detects direct app creation requests', () => {
    expect(isBrowserLocalMiniAppRequest('Can you create a budgeting app for me?')).toBe(true);
    expect(isBrowserLocalMiniAppRequest('Build a todo dashboard with filters')).toBe(true);
    expect(isBrowserLocalMiniAppRequest('make me a calculator')).toBe(true);
  });

  it('does not treat normal questions as app creation', () => {
    expect(isBrowserLocalMiniAppRequest('How do I create an app?')).toBe(false);
    expect(isBrowserLocalMiniAppRequest('Can Gemma create apps?')).toBe(false);
    expect(isBrowserLocalMiniAppRequest('What tool should I use to code a dashboard?')).toBe(false);
  });
});

describe('normalizeBrowserLocalMiniAppResponse', () => {
  it('turns loose file blocks into a saveable mini app bundle', () => {
    const normalized = normalizeBrowserLocalMiniAppResponse(
      `
\`\`\`jsx file="src/App.jsx"
export default function App() {
  return <main>Budget</main>;
}
\`\`\`

\`\`\`css file="src/styles.css"
main { min-height: 100vh; }
\`\`\`
`,
      'Create a budget tracker app',
    );

    expect(normalized).toContain('```miniapp');
    expect(normalized).toContain('"title": "Budget"');
    expect(normalized).toContain('```jsx file="src/App.jsx"');
    expect(hasBrowserLocalMiniAppBundle(normalized ?? '')).toBe(true);
  });
});
