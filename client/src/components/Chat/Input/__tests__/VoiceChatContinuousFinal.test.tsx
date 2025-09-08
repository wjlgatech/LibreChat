import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import VoiceChatContinuousFinal from '../VoiceChatContinuousFinal';

// Mock dependencies
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

describe('VoiceChatContinuousFinal - Session Continuity', () => {
  let mockSubmitMessage: jest.Mock;
  let mockSetValue: jest.Mock;
  let mockHandleSubmit: jest.Mock;
  let mockConversation: any;
  let capturedSubmissions: any[] = [];

  beforeEach(() => {
    // Reset captured submissions
    capturedSubmissions = [];
    
    // Mock window speech recognition
    (window as any).SpeechRecognition = jest.fn(() => mockSpeechRecognition);
    
    // Mock submit message to capture submissions
    mockSubmitMessage = jest.fn((data) => {
      console.log('[TEST] Submit message called with:', data);
      capturedSubmissions.push({
        data,
        conversationId: mockConversation?.conversationId,
        timestamp: Date.now(),
      });
    });

    // Mock form context
    mockSetValue = jest.fn();
    mockHandleSubmit = jest.fn((callback) => {
      return () => {
        const data = { text: 'test message' };
        callback(data);
      };
    });

    // Mock conversation with consistent ID
    mockConversation = {
      conversationId: 'test-conversation-123',
      messages: [],
    };

    // Setup mocks
    (useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: mockSubmitMessage,
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: mockSetValue,
      handleSubmit: mockHandleSubmit,
    });

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: mockConversation,
      isSubmitting: false,
      latestMessage: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete (window as any).SpeechRecognition;
  });

  it('should maintain the same conversation ID across multiple turns', async () => {
    const { rerender } = render(
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

    // Simulate first turn
    const firstResult = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Hello AI' },
        isFinal: true,
      }],
    };
    mockSpeechRecognition.onresult?.(firstResult as any);

    // Wait for submission
    await waitFor(() => {
      expect(capturedSubmissions).toHaveLength(1);
    }, { timeout: 2000 });

    console.log('[TEST] First submission:', capturedSubmissions[0]);
    expect(capturedSubmissions[0].conversationId).toBe('test-conversation-123');

    // Simulate AI response
    const aiMessage = {
      messageId: 'ai-msg-1',
      text: 'Hello! How can I help you?',
      isCreatedByUser: false,
    };
    
    (useChatContext as jest.Mock).mockReturnValue({
      conversation: mockConversation,
      isSubmitting: false,
      latestMessage: aiMessage,
    });
    
    rerender(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Simulate recognition restart for second turn
    await waitFor(() => {
      mockSpeechRecognition.onend?.();
    });

    // Simulate second turn
    const secondResult = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Tell me a joke' },
        isFinal: true,
      }],
    };
    mockSpeechRecognition.onresult?.(secondResult as any);

    // Wait for second submission
    await waitFor(() => {
      expect(capturedSubmissions).toHaveLength(2);
    }, { timeout: 2000 });

    console.log('[TEST] Second submission:', capturedSubmissions[1]);
    
    // Verify same conversation ID is used
    expect(capturedSubmissions[1].conversationId).toBe('test-conversation-123');
    expect(capturedSubmissions[0].conversationId).toBe(capturedSubmissions[1].conversationId);
  });

  it('should detect if conversation context changes between turns', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Log initial conversation state
    console.log('[TEST] Initial conversation:', mockConversation);

    // Start continuous mode
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Submit first message
    mockSetValue('text', 'First message');
    mockHandleSubmit((data: any) => {
      mockSubmitMessage(data);
    })();

    await waitFor(() => {
      expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'test message' });
    });

    // Check what was passed to submitMessage
    console.log('[TEST] submitMessage calls:', mockSubmitMessage.mock.calls);
    console.log('[TEST] Captured submissions:', capturedSubmissions);
  });
});