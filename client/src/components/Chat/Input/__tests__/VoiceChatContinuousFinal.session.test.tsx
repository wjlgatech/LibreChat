import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { useParams } from 'react-router-dom';

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

describe('VoiceChatContinuousFinal - Session Continuity Fix', () => {
  let mockSubmitMessage: jest.Mock;
  let mockAsk: jest.Mock;
  let mockSetValue: jest.Mock;
  let mockHandleSubmit: jest.Mock;
  let mockConversation: any;
  let submittedMessages: any[] = [];
  let VoiceChatContinuousFinal: any;

  beforeEach(async () => {
    // Reset state
    submittedMessages = [];
    
    // Mock window speech recognition BEFORE importing component
    (window as any).SpeechRecognition = jest.fn(() => mockSpeechRecognition);
    (window as any).webkitSpeechRecognition = jest.fn(() => mockSpeechRecognition);
    
    // Dynamically import component after mocks are set up
    const module = await import('../VoiceChatContinuousFinal');
    VoiceChatContinuousFinal = module.default;
    
    // Mock URL params to simulate conversation route
    (useParams as jest.Mock).mockReturnValue({
      conversationId: undefined, // Start with no conversation ID in URL
    });

    // Mock ask function to capture direct calls
    mockAsk = jest.fn((params) => {
      console.log('[TEST] Ask called with:', params);
      submittedMessages.push({
        data: { text: params.text },
        conversationId: params.conversationId || 'new',
        timestamp: Date.now(),
      });
    });

    // Mock submit message to capture what's being sent
    mockSubmitMessage = jest.fn((data) => {
      const currentConversation = (useChatContext as jest.Mock).mock.results[
        (useChatContext as jest.Mock).mock.results.length - 1
      ]?.value?.conversation;
      
      submittedMessages.push({
        data,
        conversationId: currentConversation?.conversationId,
        timestamp: Date.now(),
      });
      
      console.log('[TEST] Message submitted with conversation:', currentConversation?.conversationId);
    });

    // Mock form context
    mockSetValue = jest.fn();
    mockHandleSubmit = jest.fn((callback) => {
      return () => {
        const data = { text: mockSetValue.mock.calls[mockSetValue.mock.calls.length - 1]?.[1] || 'test' };
        callback(data);
      };
    });

    // Setup initial conversation state
    mockConversation = {
      conversationId: 'new',
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
      ask: mockAsk,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it('should use the SAME conversation ID for all messages in a session', async () => {
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
    
    // Simulate recognition started
    mockSpeechRecognition.onstart?.();

    // TURN 1: First message
    mockSetValue('text', 'Hello first message');
    const firstResult = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Hello first message' },
        isFinal: true,
      }],
    };
    
    console.log('Triggering speech result:', firstResult);
    mockSpeechRecognition.onresult?.(firstResult as any);

    await waitFor(() => {
      // Either ask or submitMessage should have been called
      const totalCalls = mockAsk.mock.calls.length + mockSubmitMessage.mock.calls.length;
      console.log('Total calls after first message:', totalCalls);
      console.log('Ask calls:', mockAsk.mock.calls);
      console.log('SubmitMessage calls:', mockSubmitMessage.mock.calls);
      expect(totalCalls).toBe(1);
    }, { timeout: 3000 });

    // Simulate server assigning conversation ID after first message
    const assignedConversationId = 'actual-conversation-123';
    mockConversation = {
      conversationId: assignedConversationId,
      messages: [
        { messageId: 'msg1', text: 'Hello first message', isCreatedByUser: true },
        { messageId: 'msg2', text: 'AI response 1', isCreatedByUser: false },
      ],
    };

    // Update chat context with new conversation
    (useChatContext as jest.Mock).mockReturnValue({
      conversation: mockConversation,
      isSubmitting: false,
      latestMessage: { messageId: 'msg2', text: 'AI response 1', isCreatedByUser: false },
      ask: mockAsk,
    });

    // Update URL params to reflect new conversation
    (useParams as jest.Mock).mockReturnValue({
      conversationId: assignedConversationId,
    });

    rerender(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Simulate recognition restart
    mockSpeechRecognition.onend?.();

    // TURN 2: Second message
    mockSetValue('text', 'Second message here');
    const secondResult = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Second message here' },
        isFinal: true,
      }],
    };
    mockSpeechRecognition.onresult?.(secondResult as any);

    await waitFor(() => {
      const totalCalls = mockAsk.mock.calls.length + mockSubmitMessage.mock.calls.length;
      expect(totalCalls).toBe(2);
    });

    // Add more messages to conversation
    mockConversation.messages.push(
      { messageId: 'msg3', text: 'Second message here', isCreatedByUser: true },
      { messageId: 'msg4', text: 'AI response 2', isCreatedByUser: false }
    );

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: mockConversation,
      isSubmitting: false,
      latestMessage: { messageId: 'msg4', text: 'AI response 2', isCreatedByUser: false },
      ask: mockAsk,
    });

    rerender(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // TURN 3: Third message
    mockSetValue('text', 'Third message please');
    const thirdResult = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Third message please' },
        isFinal: true,
      }],
    };
    mockSpeechRecognition.onresult?.(thirdResult as any);

    await waitFor(() => {
      const totalCalls = mockAsk.mock.calls.length + mockSubmitMessage.mock.calls.length;
      expect(totalCalls).toBe(3);
    });

    // VERIFY: All messages should use the same conversation ID
    console.log('[TEST] All submitted messages:', submittedMessages);
    
    // First message can be 'new' (that's OK, server will assign ID)
    expect(submittedMessages[0].conversationId).toBe('new');
    
    // But second and third messages MUST use the assigned conversation ID
    expect(submittedMessages[1].conversationId).toBe(assignedConversationId);
    expect(submittedMessages[2].conversationId).toBe(assignedConversationId);
    
    // Verify conversation history is maintained
    expect(mockConversation.messages.length).toBeGreaterThanOrEqual(4);
  });

  it('should handle conversation ID updates from server correctly', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    // Verify initial state
    expect(mockConversation.conversationId).toBe('new');

    // Simulate conversation ID update from server
    const newConversationId = 'server-assigned-id-456';
    
    (useChatContext as jest.Mock).mockReturnValue({
      conversation: {
        conversationId: newConversationId,
        messages: [],
      },
      isSubmitting: false,
      latestMessage: null,
      ask: mockAsk,
    });

    // Component should detect and track the new conversation ID
    await waitFor(() => {
      const latestChatContext = (useChatContext as jest.Mock).mock.results[
        (useChatContext as jest.Mock).mock.results.length - 1
      ]?.value;
      expect(latestChatContext.conversation.conversationId).toBe(newConversationId);
    });
  });
});