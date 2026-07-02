import type { IMiniApp } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { createMiniAppHandlers, type MiniAppHandlersDeps } from './handlers';

function createResponse(): Response {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return response as unknown as Response;
}

const baseMiniApp: IMiniApp = {
  title: 'Pomodoro Timer',
  description: '',
  files: [{ path: 'src/App.jsx', content: 'export default function App() { return null; }' }],
  entryFile: 'src/App.jsx',
  user: 'user-1',
  createdAt: new Date('2026-06-29T00:00:00.000Z'),
  updatedAt: new Date('2026-06-29T00:00:00.000Z'),
};

describe('mini app handlers', () => {
  it('converts row-format files to a file map after request sanitization', async () => {
    const createMiniApp = jest.fn(async () => baseMiniApp);
    const deps: MiniAppHandlersDeps = {
      createMiniApp,
      getMiniApp: jest.fn(),
      listMiniApps: jest.fn(),
      updateMiniApp: jest.fn(),
      deleteMiniApp: jest.fn(),
    };
    const handlers = createMiniAppHandlers(deps);
    const req = {
      user: { id: 'user-1', tenantId: 'tenant-1' },
      body: {
        title: 'Pomodoro Timer',
        entryFile: 'src/App.jsx',
        files: [
          { path: 'src/App.jsx', content: 'export default function App() { return null; }' },
          { path: 'src/styles.css', content: '.app { min-height: 100vh; }' },
        ],
      },
    } as unknown as ServerRequest;
    const res = createResponse();

    await handlers.create(req, res);

    expect(createMiniApp).toHaveBeenCalledWith('user-1', {
      title: 'Pomodoro Timer',
      entryFile: 'src/App.jsx',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/styles.css': '.app { min-height: 100vh; }',
      },
      tenantId: 'tenant-1',
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
