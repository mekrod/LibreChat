import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import MiniAppOpenAction from '../MiniAppOpenAction';

const bundle = {
  title: 'Updated app',
  description: 'Updated in place',
  entryFile: 'src/App.jsx',
  files: {
    'src/App.jsx': 'export default function App() { return null; }',
  },
};

const mockCreateMutateAsync = jest.fn();
const mockUpdateMutateAsync = jest.fn();
const mockUseRecoilValue = jest.fn();
const mockNavigate = jest.fn();

jest.mock('recoil', () => ({
  useRecoilValue: (...args: unknown[]) => mockUseRecoilValue(...args),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/data-provider', () => ({
  useCreateMiniAppMutation: () => ({
    mutateAsync: mockCreateMutateAsync,
    isLoading: false,
  }),
  useUpdateMiniAppMutation: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isLoading: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => ({
  useMessageContext: () => ({
    index: 0,
    isLatestMessage: false,
    isSubmitting: false,
  }),
}));

jest.mock('../runtime', () => ({
  getMiniAppBundleStorageKey: () => 'bundle-key',
  parseAnyMiniAppBundle: () => bundle,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    miniAppCustomizationByIndex: jest.fn(() => 'miniAppCustomizationByIndex'),
  },
}));

describe('MiniAppOpenAction', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUpdateMutateAsync.mockResolvedValue({ _id: 'mini-app-1' });
    mockUseRecoilValue.mockReturnValue({
      enabled: true,
      miniAppId: 'mini-app-1',
      miniAppTitle: 'Existing app',
      action: 'add_feature',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates the selected mini app instead of creating a duplicate during customization', async () => {
    render(<MiniAppOpenAction text="mini app bundle" />);

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        id: 'mini-app-1',
        payload: bundle,
      });
    });
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });
});
