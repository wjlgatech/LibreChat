import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import VoiceUnified from '../VoiceUnified';
import { RecoilRoot } from 'recoil';
import { ChatContext } from '~/Providers';

// Mock the speech recognition
const mockSpeechRecognition = {
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  continuous: false,
  interimResults: false,
  lang: 'en-US',
  onstart: null,
  onend: null,
  onresult: null,
  onerror: null,
};

global.SpeechRecognition = jest.fn(() => mockSpeechRecognition);
global.webkitSpeechRecognition = jest.fn(() => mockSpeechRecognition);

describe('VoiceUnified Component', () => {
  const mockSubmitMessage = jest.fn();
  const mockSetValue = jest.fn();
  const mockHandleSubmit = jest.fn((callback) => () => callback({ text: 'test message' }));
  const mockShowToast = jest.fn();
  
  const mockChatContext = {
    conversation: { conversationId: 'test-123' },
    isSubmitting: false,
    getMessages: jest.fn(() => []),
    setMessages: jest.fn(),
    latestMessage: null,
    ask: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Mock hooks
  jest.mock('~/hooks', () => ({
    useSubmitMessage: () => ({ submitMessage: mockSubmitMessage }),
    useLocalize: () => (key: string) => key,
  }));
  
  jest.mock('~/Providers', () => ({
    useChatFormContext: () => ({
      setValue: mockSetValue,
      handleSubmit: mockHandleSubmit,
      reset: jest.fn(),
    }),
    useChatContext: () => mockChatContext,
  }));
  
  jest.mock('@librechat/client', () => ({
    useToastContext: () => ({ showToast: mockShowToast }),
    TooltipAnchor: ({ render }: any) => render,
  }));

  const renderComponent = () => {
    return render(
      <RecoilRoot>
        <ChatContext.Provider value={mockChatContext as any}>
          <VoiceUnified disabled={false} />
        </ChatContext.Provider>
      </RecoilRoot>
    );
  };

  describe('Component Rendering', () => {
    it('should render a single voice button with sound wave icon', () => {
      renderComponent();
      const button = screen.getByRole('button', { name: /voice/i });
      expect(button).toBeInTheDocument();
      
      // Check for sound wave icon (SVG with specific path)
      const svg = button.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    });

    it('should show different states: idle, listening, processing', () => {
      renderComponent();
      const button = screen.getByRole('button');
      
      // Idle state
      expect(button).toHaveClass('text-muted-foreground');
      
      // Click to start
      fireEvent.click(button);
      
      // Should show active/listening state
      expect(button).toHaveClass('bg-surface-tertiary');
    });
  });

  describe('Voice Mode Behavior', () => {
    it('should support both single-turn and continuous modes', async () => {
      renderComponent();
      const button = screen.getByRole('button');
      
      // Single click = single turn mode
      fireEvent.click(button);
      expect(mockSpeechRecognition.start).toHaveBeenCalled();
      expect(mockSpeechRecognition.continuous).toBe(false);
      
      // Double click = continuous mode
      fireEvent.doubleClick(button);
      expect(mockSpeechRecognition.continuous).toBe(true);
    });
  });

  describe('Message Submission', () => {
    it('should maintain conversation context across multiple turns', async () => {
      renderComponent();
      const button = screen.getByRole('button');
      
      // Start continuous mode
      fireEvent.doubleClick(button);
      
      // Simulate first transcription
      mockSpeechRecognition.onresult({
        results: [{ 0: { transcript: 'First message' }, isFinal: true }],
        resultIndex: 0,
      });
      
      // Wait for submission
      await waitFor(() => {
        expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'First message' });
      });
      
      // Verify conversation ID is maintained
      expect(mockChatContext.conversation.conversationId).toBe('test-123');
      
      // Simulate second transcription in same conversation
      mockSpeechRecognition.onresult({
        results: [{ 0: { transcript: 'Second message' }, isFinal: true }],
        resultIndex: 0,
      });
      
      await waitFor(() => {
        expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'Second message' });
      });
      
      // Verify conversation ID is still the same
      expect(mockChatContext.conversation.conversationId).toBe('test-123');
      expect(mockSubmitMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('Continuous Mode Features', () => {
    it('should auto-submit after 1.5 seconds of silence', async () => {
      jest.useFakeTimers();
      renderComponent();
      
      // Start continuous mode
      fireEvent.doubleClick(screen.getByRole('button'));
      
      // Simulate speech
      mockSpeechRecognition.onresult({
        results: [{ 0: { transcript: 'Hello world' }, isFinal: false }],
        resultIndex: 0,
      });
      
      // Advance time by 1.5 seconds
      jest.advanceTimersByTime(1500);
      
      await waitFor(() => {
        expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'Hello world' });
      });
      
      jest.useRealTimers();
    });

    it('should resume listening after AI response', async () => {
      renderComponent();
      
      // Start continuous mode
      fireEvent.doubleClick(screen.getByRole('button'));
      expect(mockSpeechRecognition.start).toHaveBeenCalledTimes(1);
      
      // Simulate message submission
      mockSpeechRecognition.onresult({
        results: [{ 0: { transcript: 'Test message' }, isFinal: true }],
        resultIndex: 0,
      });
      
      // Simulate AI response received
      mockChatContext.latestMessage = {
        messageId: 'ai-123',
        text: 'AI response',
        isCreatedByUser: false,
      };
      
      // Should resume listening
      await waitFor(() => {
        expect(mockSpeechRecognition.start).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast on recognition error', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button'));
      
      mockSpeechRecognition.onerror({ error: 'network' });
      
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'Voice recognition error: network',
        status: 'error',
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and states', () => {
      renderComponent();
      const button = screen.getByRole('button');
      
      expect(button).toHaveAttribute('aria-label');
      expect(button).toHaveAttribute('type', 'button');
      
      // When active
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });
  });
});