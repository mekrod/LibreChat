import request from './request';
import { createMiniApp, updateMiniApp } from './data-service';
import * as endpoints from './api-endpoints';

jest.mock('./request', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockedRequest = request as jest.Mocked<Pick<typeof request, 'post' | 'patch'>>;

describe('mini app data service', () => {
  beforeEach(() => {
    mockedRequest.post.mockResolvedValue({});
    mockedRequest.patch.mockResolvedValue({});
  });

  it('sends create files as path/content rows so dotted paths survive request sanitizers', async () => {
    await createMiniApp({
      title: 'Pomodoro Timer',
      entryFile: 'src/App.jsx',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/styles.css': '.app { min-height: 100vh; }',
      },
    });

    expect(mockedRequest.post).toHaveBeenCalledWith(endpoints.miniApps(), {
      title: 'Pomodoro Timer',
      entryFile: 'src/App.jsx',
      files: [
        { path: 'src/App.jsx', content: 'export default function App() { return null; }' },
        { path: 'src/styles.css', content: '.app { min-height: 100vh; }' },
      ],
    });
  });

  it('sends update files as path/content rows when files are present', async () => {
    await updateMiniApp('mini-app-1', {
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
      },
    });

    expect(mockedRequest.patch).toHaveBeenCalledWith(endpoints.miniAppById('mini-app-1'), {
      files: [{ path: 'src/App.jsx', content: 'export default function App() { return null; }' }],
    });
  });
});
