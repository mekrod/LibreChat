import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import miniAppSchema from '~/schema/miniApp';
import type { IMiniAppDocument } from '~/types';
import { createMiniAppMethods } from './miniApp';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createMiniAppMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  if (!mongoose.models.MiniApp) {
    mongoose.model<IMiniAppDocument>('MiniApp', miniAppSchema);
  }
  methods = createMiniAppMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.MiniApp.deleteMany({});
});

describe('mini app methods', () => {
  it('accepts path/content file rows with dotted paths', async () => {
    const miniApp = await methods.createMiniApp('user-1', {
      title: 'Pomodoro Timer',
      entryFile: 'src/App.jsx',
      files: [
        {
          path: 'src/App.jsx',
          content: 'export default function App() { return null; }',
        },
        {
          path: 'src/styles.css',
          content: '.app { min-height: 100vh; }',
        },
      ],
    });

    expect(miniApp.entryFile).toBe('src/App.jsx');
    expect(miniApp.files).toEqual([
      { path: 'src/App.jsx', content: 'export default function App() { return null; }' },
      { path: 'src/styles.css', content: '.app { min-height: 100vh; }' },
    ]);
  });

  it('still accepts the legacy file map before request sanitization', async () => {
    const miniApp = await methods.createMiniApp('user-1', {
      title: 'Pomodoro Timer',
      entryFile: 'src/App.jsx',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
      },
    });

    expect(miniApp.files).toEqual([
      { path: 'src/App.jsx', content: 'export default function App() { return null; }' },
    ]);
  });
});
