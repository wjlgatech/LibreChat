import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

describe('VoiceChatContinuousFinal - Multi-Turn Conversation', () => {
  jest.setTimeout(10000); // Increase timeout for multi-turn tests
  let mockSubmitMessage: jest.Mock;
  let mockAsk: jest.Mock;
  let mockSetValue: jest.Mock;
  let mockHandleSubmit: jest.Mock;
  let VoiceChatContinuousFinal: any;
  let messages: any[] = [];
  let conversationState = {
    conversationId: 'new',
    messages: [],
  };

  beforeEach(async () => {
    // Reset state
    messages = [];
    conversationState = {
      conversationId: 'new',
      messages: [],
    };
    
    // Mock window speech recognition
    (window as any).SpeechRecognition = jest.fn(() => mockSpeechRecognition);
    (window as any).webkitSpeechRecognition = jest.fn(() => mockSpeechRecognition);
    
    // Dynamically import component after mocks are set up
    const module = await import('../VoiceChatContinuousFinal');
    VoiceChatContinuousFinal = module.default;
    
    // Reset all mocks
    jest.clearAllMocks();
    mockSpeechRecognition.onstart = null;
    mockSpeechRecognition.onresult = null;
    mockSpeechRecognition.onerror = null;
    mockSpeechRecognition.onend = null;

    // Mock URL params
    (useParams as jest.Mock).mockReturnValue({
      conversationId: undefined,
    });

    // Mock functions
    mockAsk = jest.fn((params) => {
      console.log('[TEST] Ask called with:', params);
      messages.push({
        type: 'ask',
        text: params.text,
        conversationId: params.conversationId,
        timestamp: Date.now(),
      });
    });

    mockSubmitMessage = jest.fn((data) => {
      console.log('[TEST] SubmitMessage called with:', data);
      messages.push({
        type: 'submit',
        text: data.text,
        conversationId: conversationState.conversationId,
        timestamp: Date.now(),
      });
    });

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
      conversation: conversationState,
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

  it('should maintain the same conversation across multiple turns', async () => {
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

    // TURN 1: First user message
    console.log('\n=== TURN 1: First user message ===');
    
    act(() => {
      mockSpeechRecognition.onresult?.({
        resultIndex: 0,
        results: [{
          0: { transcript: 'Hello AI assistant' },
          isFinal: true,
        }],
      } as any);
    });

    // Wait for submission
    await waitFor(() => {
      expect(messages.length).toBe(1);
      expect(messages[0].text).toBe('Hello AI assistant');
    }, { timeout: 3000 });

    // Simulate server response - assign conversation ID
    const assignedConversationId = 'conv-123-abc';
    conversationState = {
      conversationId: assignedConversationId,
      messages: [
        { messageId: 'user1', text: 'Hello AI assistant', isCreatedByUser: true },
        { messageId: 'ai1', text: 'Hello! How can I help you?', isCreatedByUser: false },
      ],
    };

    // Update mocks with new state
    (useParams as jest.Mock).mockReturnValue({
      conversationId: assignedConversationId,
    });

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: conversationState,
      isSubmitting: false,
      latestMessage: { 
        messageId: 'ai1', 
        text: 'Hello! How can I help you?', 
        isCreatedByUser: false,
        conversationId: assignedConversationId,
      },
      ask: mockAsk,
    });

    // Rerender to simulate state update
    rerender(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Wait for conversation ID to be tracked
    await waitFor(() => {
      // Component should have detected the new conversation ID
      console.log('Conversation state after server response:', conversationState);
    });

    // Simulate recognition restart after AI response
    act(() => {
      mockSpeechRecognition.onend?.();
    });

    // Wait a bit for recognition to restart
    await new Promise(resolve => setTimeout(resolve, 600));

    // TURN 2: Second user message
    console.log('\n=== TURN 2: Second user message ===');
    
    act(() => {
      mockSpeechRecognition.onresult?.({
        resultIndex: 0,
        results: [{
          0: { transcript: 'What is the weather today' },
          isFinal: true,
        }],
      } as any);
    });

    // Wait for second submission
    await waitFor(() => {
      expect(messages.length).toBe(2);
      const secondMessage = messages[1];
      console.log('Second message:', secondMessage);
      
      // The second message should use ask() with the assigned conversation ID
      expect(secondMessage.type).toBe('ask');
      expect(secondMessage.text).toBe('What is the weather today');
      expect(secondMessage.conversationId).toBe(assignedConversationId);
    }, { timeout: 3000 });

    // Add AI response
    conversationState.messages.push(
      { messageId: 'user2', text: 'What is the weather today', isCreatedByUser: true },
      { messageId: 'ai2', text: 'I cannot check the weather...', isCreatedByUser: false }
    );

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: conversationState,
      isSubmitting: false,
      latestMessage: { 
        messageId: 'ai2', 
        text: 'I cannot check the weather...', 
        isCreatedByUser: false,
        conversationId: assignedConversationId,
      },
      ask: mockAsk,
    });

    rerender(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Simulate recognition restart
    act(() => {
      mockSpeechRecognition.onend?.();
    });

    await new Promise(resolve => setTimeout(resolve, 600));

    // TURN 3: Third user message
    console.log('\n=== TURN 3: Third user message ===');
    
    act(() => {
      mockSpeechRecognition.onresult?.({
        resultIndex: 0,
        results: [{
          0: { transcript: 'Thank you for your help' },
          isFinal: true,
        }],
      } as any);
    });

    // Wait for third submission
    await waitFor(() => {
      expect(messages.length).toBe(3);
      const thirdMessage = messages[2];
      console.log('Third message:', thirdMessage);
      
      // The third message should also use the same conversation ID
      expect(thirdMessage.type).toBe('ask');
      expect(thirdMessage.text).toBe('Thank you for your help');
      expect(thirdMessage.conversationId).toBe(assignedConversationId);
    }, { timeout: 3000 });

    // Verify all messages are in the same conversation
    console.log('\n=== Final verification ===');
    console.log('All messages:', messages);
    
    // First message can be 'new' or use submitMessage
    expect(messages[0].text).toBe('Hello AI assistant');
    
    // All subsequent messages should use the assigned conversation ID
    expect(messages[1].conversationId).toBe(assignedConversationId);
    expect(messages[2].conversationId).toBe(assignedConversationId);
    
    // Verify conversation continuity
    expect(conversationState.messages.length).toBe(4); // 2 user + 2 AI messages in our test
  });
});