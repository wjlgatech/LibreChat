import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import userEvent from '@testing-library/user-event';
import VoiceChatContinuous from '../VoiceChatContinuous';
import { ChatContext, ChatFormContext } from '~/Providers';
import { vi } from 'vitest';

// Mock speech APIs
const mockSpeechRecognition = vi.fn();
const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  getVoices: vi.fn().mockReturnValue([]),
};

// Mock global objects
global.SpeechRecognition = mockSpeechRecognition;
global.webkitSpeechRecognition = mockSpeechRecognition;
global.speechSynthesis = mockSpeechSynthesis;

describe('VoiceChatContinuous - TDD Tests', () => {
  const mockSubmitMessage = vi.fn();
  const mockHandleSubmit = vi.fn((callback) => () => callback({ text: 'test message' }));
  const mockSetValue = vi.fn();
  
  const mockChatContext = {
    conversation: { conversationId: 'test-123' },
    isSubmitting: false,
  };
  
  const mockFormContext = {
    handleSubmit: mockHandleSubmit,
    setValue: mockSetValue,
  };
  
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot>
      <ChatContext.Provider value={mockChatContext as any}>
        <ChatFormContext.Provider value={mockFormContext as any}>
          {children}
        </ChatFormContext.Provider>
      </ChatContext.Provider>
    </RecoilRoot>
  );
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeechRecognition.mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      continuous: false,
      interimResults: false,
      lang: '',
      onstart: null,
      onresult: null,
      onerror: null,
      onend: null,
    }));
  });
  
  describe('Feature 1: Continuous Listening Mode', () => {
    it('should start continuous mode when button is clicked', async () => {
      render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button', { name: /voice continuous/i });
      expect(button).toBeInTheDocument();
      
      await userEvent.click(button);
      
      // Should speak welcome message
      await waitFor(() => {
        expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining('Continuous voice mode activated')
          })
        );
      });
    });
    
    it('should show visual indicator when active', async () => {
      render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      // Should show pulse indicator
      await waitFor(() => {
        const indicator = button.querySelector('.animate-pulse');
        expect(indicator).toBeInTheDocument();
      });
    });
  });
  
  describe('Feature 2: Silence Detection and Auto-Submit', () => {
    it('should submit after 1.5 seconds of silence', async () => {
      vi.useFakeTimers();
      const { rerender } = render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      // Simulate speech recognition starting
      const recognition = mockSpeechRecognition.mock.results[0].value;
      recognition.onstart?.();
      
      // Simulate speech with final result
      recognition.onresult?.({
        resultIndex: 0,
        results: [{
          isFinal: true,
          0: { transcript: 'Hello AI assistant' }
        }]
      });
      
      // Fast-forward 1.5 seconds
      vi.advanceTimersByTime(1500);
      
      await waitFor(() => {
        expect(mockSetValue).toHaveBeenCalledWith('text', 'Hello AI assistant ');
        expect(mockHandleSubmit).toHaveBeenCalled();
      });
      
      vi.useRealTimers();
    });
    
    it('should reset silence timer on new speech', async () => {
      vi.useFakeTimers();
      render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      const recognition = mockSpeechRecognition.mock.results[0].value;
      
      // First speech
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'First part' } }]
      });
      
      vi.advanceTimersByTime(1000);
      
      // Second speech before timeout
      recognition.onresult?.({
        resultIndex: 1,
        results: [{ isFinal: true, 0: { transcript: 'Second part' } }]
      });
      
      vi.advanceTimersByTime(1000);
      
      // Should not have submitted yet
      expect(mockHandleSubmit).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(500);
      
      // Now should submit with combined text
      await waitFor(() => {
        expect(mockSetValue).toHaveBeenCalledWith('text', 'First part Second part ');
      });
      
      vi.useRealTimers();
    });
  });
  
  describe('Feature 3: AI Voice Response Playback', () => {
    it('should speak AI response when new message arrives', async () => {
      const { rerender } = render(<VoiceChatContinuous />, { wrapper });
      
      // Activate continuous mode
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      // Clear initial welcome message call
      mockSpeechSynthesis.speak.mockClear();
      
      // Simulate new AI message by updating context
      const newContext = {
        ...mockChatContext,
        conversation: { conversationId: 'test-123' },
      };
      
      // Re-render with messages
      const wrapperWithMessages = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot 
          initializeState={({ set }) => {
            set(messagesState, {
              'test-123': [
                { messageId: 'ai-1', text: 'Hello, how can I help?', isCreatedByUser: false }
              ]
            });
          }}
        >
          <ChatContext.Provider value={newContext as any}>
            <ChatFormContext.Provider value={mockFormContext as any}>
              {children}
            </ChatFormContext.Provider>
          </ChatContext.Provider>
        </RecoilRoot>
      );
      
      rerender(<VoiceChatContinuous />, { wrapper: wrapperWithMessages });
      
      await waitFor(() => {
        expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'Hello, how can I help?'
          })
        );
      });
    });
    
    it('should stop listening while AI is speaking', async () => {
      render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      const recognition = mockSpeechRecognition.mock.results[0].value;
      
      // Verify recognition started
      expect(recognition.start).toHaveBeenCalled();
      
      // Trigger AI speaking
      const utterance = mockSpeechSynthesis.speak.mock.calls[0]?.[0];
      utterance?.onstart?.();
      
      // Should stop recognition
      expect(recognition.abort).toHaveBeenCalled();
    });
  });
  
  describe('Feature 4: Resume Listening After AI Response', () => {
    it('should resume listening after AI finishes speaking', async () => {
      render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      // Get the utterance from welcome message
      const utterance = mockSpeechSynthesis.speak.mock.calls[0]?.[0];
      
      // Clear mock to track new recognition
      mockSpeechRecognition.mockClear();
      
      // Simulate speech end
      utterance?.onend?.();
      
      // Should create new recognition after delay
      await waitFor(() => {
        expect(mockSpeechRecognition).toHaveBeenCalled();
      }, { timeout: 1000 });
    });
  });
  
  describe('Feature 5: Stop Continuous Mode', () => {
    it('should stop all activities when button clicked again', async () => {
      render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button');
      
      // Start
      await userEvent.click(button);
      const recognition = mockSpeechRecognition.mock.results[0].value;
      
      // Stop
      await userEvent.click(button);
      
      expect(recognition.abort).toHaveBeenCalled();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });
  });
  
  describe('Feature 6: Error Handling', () => {
    it('should show error toast if browser not supported', async () => {
      // Remove speech recognition support
      global.SpeechRecognition = undefined;
      global.webkitSpeechRecognition = undefined;
      
      render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      // Should show error (would need to mock toast context)
      expect(button).toBeDisabled();
      
      // Restore
      global.SpeechRecognition = mockSpeechRecognition;
    });
    
    it('should restart recognition on no-speech error', async () => {
      vi.useFakeTimers();
      render(<VoiceChatContinuous />, { wrapper });
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      const recognition = mockSpeechRecognition.mock.results[0].value;
      
      mockSpeechRecognition.mockClear();
      
      // Simulate no-speech error
      recognition.onerror?.({ error: 'no-speech' });
      recognition.onend?.();
      
      vi.advanceTimersByTime(600);
      
      // Should restart
      await waitFor(() => {
        expect(mockSpeechRecognition).toHaveBeenCalled();
      });
      
      vi.useRealTimers();
    });
  });
});