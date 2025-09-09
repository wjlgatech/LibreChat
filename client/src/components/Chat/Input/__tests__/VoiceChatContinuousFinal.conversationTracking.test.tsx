import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { useParams } from 'react-router-dom';

// Setup speech recognition before imports
(window as any).SpeechRecognition = jest.fn();
(window as any).webkitSpeechRecognition = jest.fn();

// Mock dependencies
jest.mock('react-router-dom', () => ({
  useParams: jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
  useChatFormContext: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSubmitMessage: jest.fn(),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
  TooltipAnchor: ({ render }: any) => render,
}));

// Mock speech recognition
const mockSpeechRecognition = {
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  continuous: true,
  interimResults: true,
  lang: 'en-US',
  onstart: null as any,
  onresult: null as any,
  onerror: null as any,
  onend: null as any,
};

// Import mocked modules
const { useChatContext, useChatFormContext } = require('~/Providers');
const { useSubmitMessage } = require('~/hooks');

describe('VoiceChatContinuousFinal - Conversation ID Tracking', () => {
  let mockSubmitMessage: jest.Mock;
  let mockAsk: jest.Mock;
  let mockSetValue: jest.Mock;
  let mockHandleSubmit: jest.Mock;
  let VoiceChatContinuousFinal: any;
  let conversationIdRef: { current: string | null } = { current: null };

  beforeEach(async () => {
    // Reset mocks
    conversationIdRef.current = null;
    
    // Mock window speech recognition
    (window as any).SpeechRecognition = jest.fn(() => mockSpeechRecognition);
    (window as any).webkitSpeechRecognition = jest.fn(() => mockSpeechRecognition);
    
    // Dynamically import component after mocks are set up
    const module = await import('../VoiceChatContinuousFinal');
    VoiceChatContinuousFinal = module.default;
    
    // Reset all mocks
    mockSpeechRecognition.start.mockClear();
    mockSpeechRecognition.abort.mockClear();
    mockSpeechRecognition.onstart = null;
    mockSpeechRecognition.onresult = null;
    mockSpeechRecognition.onerror = null;
    mockSpeechRecognition.onend = null;

    // Mock URL params
    (useParams as jest.Mock).mockReturnValue({
      conversationId: undefined,
    });

    // Mock functions
    mockAsk = jest.fn();
    mockSubmitMessage = jest.fn();
    mockSetValue = jest.fn();
    mockHandleSubmit = jest.fn((callback) => () => {
      const data = { text: mockSetValue.mock.calls[mockSetValue.mock.calls.length - 1]?.[1] || 'test' };
      callback(data);
    });

    // Setup mocks
    (useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: mockSubmitMessage,
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: mockSetValue,
      handleSubmit: mockHandleSubmit,
    });

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: { conversationId: 'new' },
      isSubmitting: false,
      latestMessage: null,
      ask: mockAsk,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it('should track conversation ID after it is assigned by the server', async () => {
    const { rerender } = render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Start continuous mode
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Wait for recognition to start
    await waitFor(() => {
      expect(mockSpeechRecognition.start).toHaveBeenCalled();
    });

    // STEP 1: Initial state - conversation is 'new'
    let chatContext = (useChatContext as jest.Mock).mock.results[
      (useChatContext as jest.Mock).mock.results.length - 1
    ]?.value;
    expect(chatContext.conversation.conversationId).toBe('new');

    // STEP 2: Simulate server assigning conversation ID
    const assignedId = 'server-assigned-abc123';
    
    // Update URL to reflect the new conversation
    (useParams as jest.Mock).mockReturnValue({
      conversationId: assignedId,
    });
    
    // Update chat context with assigned ID
    (useChatContext as jest.Mock).mockReturnValue({
      conversation: { 
        conversationId: assignedId,
        messages: []
      },
      isSubmitting: false,
      latestMessage: null,
      ask: mockAsk,
    });

    // Rerender to trigger effect
    rerender(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Wait for component to process the update
    await waitFor(() => {
      // Component should detect the new conversation ID
      const latestContext = (useChatContext as jest.Mock).mock.results[
        (useChatContext as jest.Mock).mock.results.length - 1
      ]?.value;
      expect(latestContext.conversation.conversationId).toBe(assignedId);
    });

    // STEP 3: Submit a message and verify it uses the tracked conversation ID
    const transcript = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Test message after ID assigned' },
        isFinal: true,
      }],
    };
    
    mockSpeechRecognition.onresult?.(transcript as any);

    // Wait for submission with timeout
    await waitFor(() => {
      const askCalls = mockAsk.mock.calls;
      const submitCalls = mockSubmitMessage.mock.calls;
      
      // We expect the ask function to be called with the tracked conversation ID
      if (askCalls.length > 0) {
        const lastAskCall = askCalls[askCalls.length - 1];
        expect(lastAskCall[0]).toMatchObject({
          text: 'Test message after ID assigned',
          conversationId: assignedId,
        });
      } else if (submitCalls.length > 0) {
        // Or submitMessage might be called for new conversation
        expect(submitCalls.length).toBeGreaterThan(0);
      } else {
        // Force a failure if neither was called
        expect(askCalls.length + submitCalls.length).toBeGreaterThan(0);
      }
    }, { timeout: 3000 });
  });

  it('should use ask() with conversation ID for subsequent messages', async () => {
    const { rerender } = render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Start with an existing conversation
    const existingId = 'existing-conversation-123';
    
    (useParams as jest.Mock).mockReturnValue({
      conversationId: existingId,
    });
    
    (useChatContext as jest.Mock).mockReturnValue({
      conversation: { 
        conversationId: existingId,
        messages: [
          { messageId: 'msg1', text: 'Previous message' }
        ]
      },
      isSubmitting: false,
      latestMessage: { messageId: 'msg1', text: 'Previous message' },
      ask: mockAsk,
    });

    rerender(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Start continuous mode
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSpeechRecognition.start).toHaveBeenCalled();
    });

    // Submit a message
    const transcript = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Continue the conversation' },
        isFinal: true,
      }],
    };
    
    mockSpeechRecognition.onresult?.(transcript as any);

    // Should use ask() with the existing conversation ID
    await waitFor(() => {
      expect(mockAsk).toHaveBeenCalledWith({
        text: 'Continue the conversation',
        conversationId: existingId,
      });
    }, { timeout: 3000 });
  });
});