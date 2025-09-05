import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VoiceChatContinuous from '../VoiceChatContinuousFinal3';

// Mock the hooks and providers
const mockSubmitMessage = jest.fn();
const mockGetMessages = jest.fn(() => []);
const mockConversation = { conversationId: 'new', messages: [] };
const mockSetConversation = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSubmitMessage: () => ({
    submitMessage: mockSubmitMessage,
  }),
}));

jest.mock('~/Providers', () => ({
  useChatFormContext: () => ({
    register: () => ({ ref: jest.fn() }),
    setValue: jest.fn(),
    handleSubmit: (fn: any) => () => fn({ text: 'test message' }),
    reset: jest.fn(),
  }),
  useChatContext: () => ({
    conversation: mockConversation,
    isSubmitting: false,
    setConversation: mockSetConversation,
    getMessages: mockGetMessages,
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({
    data: [],
  }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
  TooltipAnchor: ({ render }: any) => <div>{render}</div>,
}));

// Mock speech recognition
const mockRecognition = {
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  continuous: true,
  interimResults: true,
  lang: 'en-US',
  onstart: null as any,
  onresult: null as any,
  onerror: null as any,
  onend: null as any,
};

(global as any).webkitSpeechRecognition = jest.fn(() => mockRecognition);
(global as any).speechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  getVoices: jest.fn(() => []),
};
(global as any).SpeechSynthesisUtterance = jest.fn();

describe('Voice Continuous Mode - Conversation Persistence', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    
    jest.clearAllMocks();
    
    // Reset mock conversation
    mockConversation.conversationId = 'new';
    mockConversation.messages = [];
    mockGetMessages.mockReturnValue([]);
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        {children}
      </RecoilRoot>
    </QueryClientProvider>
  );

  test('should log conversation tracking info when continuous mode is activated', async () => {
    const consoleSpy = jest.spyOn(console, 'log');

    render(
      <TestWrapper>
        <VoiceChatContinuous />
      </TestWrapper>
    );

    // Start continuous mode
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Check initialization logs
    expect(consoleSpy).toHaveBeenCalledWith('[VoiceContinuous] Initializing continuous mode');
    expect(consoleSpy).toHaveBeenCalledWith('[VoiceContinuous] Current conversation ID:', 'new');

    consoleSpy.mockRestore();
  });

  test('should track conversation ID changes and warn about unexpected changes', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    const { rerender } = render(
      <TestWrapper>
        <VoiceChatContinuous />
      </TestWrapper>
    );

    // Start continuous mode
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Update conversation ID
    mockConversation.conversationId = 'conv-123';
    
    rerender(
      <TestWrapper>
        <VoiceChatContinuous />
      </TestWrapper>
    );

    // Check for conversation change logs
    expect(consoleSpy).toHaveBeenCalledWith(
      '[VoiceContinuous] Conversation changed from',
      expect.any(String),
      'to',
      'conv-123'
    );

    consoleSpy.mockRestore();
  });

  test('should track message count changes', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    render(
      <TestWrapper>
        <VoiceChatContinuous />
      </TestWrapper>
    );

    // Start continuous mode
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Update messages
    mockGetMessages.mockReturnValue([
      { messageId: 'msg-1', text: 'Hello', isCreatedByUser: true },
      { messageId: 'msg-2', text: 'Hi there!', isCreatedByUser: false }
    ]);

    // Trigger re-render to check message count
    fireEvent.click(button); // Stop
    fireEvent.click(button); // Start again

    expect(consoleSpy).toHaveBeenCalledWith('[VoiceContinuous] Current messages:', 2);

    consoleSpy.mockRestore();
  });

  test('should show warning when conversation has not been initialized', async () => {
    const consoleSpy = jest.spyOn(console, 'log');

    render(
      <TestWrapper>
        <VoiceChatContinuous />
      </TestWrapper>
    );

    // Start continuous mode
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Simulate speech recognition
    act(() => {
      if (mockRecognition.onstart) mockRecognition.onstart();
    });

    // Simulate speech result
    act(() => {
      if (mockRecognition.onresult) {
        mockRecognition.onresult({
          resultIndex: 0,
          results: [{
            isFinal: true,
            0: { transcript: 'Test message' }
          }]
        });
      }
    });

    // Wait for silence timeout
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1600));
    });

    // Check logs
    expect(consoleSpy).toHaveBeenCalledWith('[VoiceContinuous] Has initialized conversation:', false);

    consoleSpy.mockRestore();
  });
});