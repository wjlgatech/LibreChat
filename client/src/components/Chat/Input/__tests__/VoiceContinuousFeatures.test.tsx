/**
 * TDD Test Suite for Voice Continuous Mode Features 3-6
 * Feature 3: Speak the AI response with voice
 * Feature 4: Resume listening after AI finishes
 * Feature 5: Continue for multiple turns
 * Feature 6: Show visual indicators of current state
 */

// Set up browser API mocks before any imports
const mockRecognitionInstance = {
  continuous: false,
  interimResults: false,
  lang: '',
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

const mockUtteranceInstance = {
  text: '',
  rate: 1,
  pitch: 1,
  volume: 1,
  voice: null,
  addEventListener: jest.fn(),
  onstart: null,
  onend: null,
  onerror: null,
};

// Set up window mocks
Object.defineProperty(window, 'SpeechRecognition', {
  writable: true,
  value: jest.fn(() => mockRecognitionInstance)
});
Object.defineProperty(window, 'webkitSpeechRecognition', {
  writable: true,
  value: jest.fn(() => mockRecognitionInstance)
});
Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: {
    speak: jest.fn(),
    cancel: jest.fn(),
    getVoices: jest.fn(() => [
      { name: 'Google US English', lang: 'en-US' }
    ]),
    onvoiceschanged: null,
  }
});
Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  writable: true,
  value: jest.fn((text) => {
    mockUtteranceInstance.text = text;
    return mockUtteranceInstance;
  })
});

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoilRoot } from 'recoil';
import '@testing-library/jest-dom';

// Mock dependencies
const mockSubmitMessage = jest.fn();
const mockSetValue = jest.fn();
const mockHandleSubmit = jest.fn((fn) => () => {
  const lastSetValueCall = mockSetValue.mock.calls[mockSetValue.mock.calls.length - 1];
  const text = lastSetValueCall ? lastSetValueCall[1] : 'test';
  fn({ text });
});

jest.mock('~/store', () => {
  const { atom } = require('recoil');
  return {
    messages: atom({ key: 'messages', default: {} }),
  };
});

jest.mock('~/store/voice', () => {
  const { atom } = require('recoil');
  return {
    voiceListeningState: atom({ key: 'voiceListening', default: false }),
    voiceTranscriptState: atom({ key: 'voiceTranscript', default: { text: '', isFinal: false } }),
    voiceAIResponseState: atom({ key: 'voiceAIResponse', default: { text: '', isPlaying: false } }),
    voiceContinuousModeState: atom({ key: 'voiceContinuousMode', default: false }),
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSubmitMessage: () => ({ submitMessage: mockSubmitMessage }),
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ 
    conversation: { conversationId: 'test-123' }, 
    isSubmitting: false 
  }),
  useChatFormContext: () => ({ 
    setValue: mockSetValue, 
    handleSubmit: mockHandleSubmit 
  }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
  TooltipAnchor: ({ render }: any) => <div>{render}</div>,
}));

// Mock messages hook with ability to simulate new messages
let mockMessages: any[] = [];
const setMockMessages = (messages: any[]) => {
  mockMessages = messages;
};

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ 
    data: mockMessages 
  }),
}));

// Import component after all mocks are set up
import VoiceChatContinuous from '../VoiceChatContinuousFixed3';

describe('Voice Continuous Mode Features 3-6', () => {
  let recognitionEventHandlers: any = {};
  let messageIdCounter = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = [];
    messageIdCounter = 1;
    
    // Reset event handlers
    recognitionEventHandlers = {};
    
    // Mock recognition behavior
    mockRecognitionInstance.start.mockImplementation(() => {
      console.log('TEST: Recognition started');
      setTimeout(() => {
        if (recognitionEventHandlers.start) {
          recognitionEventHandlers.start();
        }
      }, 10);
    });
    
    mockRecognitionInstance.addEventListener.mockImplementation((event, handler) => {
      console.log(`TEST: Recognition event listener added: ${event}`);
      recognitionEventHandlers[event] = handler;
    });
    
    mockRecognitionInstance.abort.mockImplementation(() => {
      console.log('TEST: Recognition aborted');
      if (recognitionEventHandlers.end) {
        recognitionEventHandlers.end();
      }
    });
    
    // Mock speech synthesis behavior
    (window.speechSynthesis.speak as jest.Mock).mockImplementation((utterance) => {
      console.log('TEST: speechSynthesis.speak called with:', utterance.text);
      
      // Simulate async speech
      setTimeout(() => {
        if (utterance.onstart) {
          console.log('TEST: Firing utterance.onstart');
          utterance.onstart();
        }
        
        setTimeout(() => {
          if (utterance.onend) {
            console.log('TEST: Firing utterance.onend');
            utterance.onend();
          }
        }, 100);
      }, 50);
    });
  });

  describe('Feature 3: Speak the AI response with voice', () => {
    test('should speak AI response when new message is detected', async () => {
      const { rerender } = render(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      // Start continuous mode
      const button = screen.getByRole('button', { name: /continuous/i });
      await userEvent.click(button);
      
      // Wait for welcome message to be spoken
      await waitFor(() => {
        expect(window.speechSynthesis.speak).toHaveBeenCalled();
      });
      
      // Clear mock to track AI response speech
      (window.speechSynthesis.speak as jest.Mock).mockClear();
      
      // Simulate user speaking and submitting
      if (mockUtteranceInstance.onend) {
        act(() => mockUtteranceInstance.onend());
      }
      
      // Wait for recognition to start
      await waitFor(() => {
        expect(mockRecognitionInstance.start).toHaveBeenCalled();
      });
      
      // Simulate user speech
      act(() => {
        recognitionEventHandlers.result?.({
          resultIndex: 0,
          results: [{
            isFinal: true,
            0: { transcript: 'Hello AI' }
          }]
        });
      });
      
      // Fast forward for silence detection
      jest.useFakeTimers();
      act(() => jest.advanceTimersByTime(1500));
      jest.useRealTimers();
      
      // Verify message was submitted
      expect(mockSubmitMessage).toHaveBeenCalled();
      
      // Add AI response message
      const aiMessage = {
        messageId: `msg-${messageIdCounter++}`,
        text: 'Hello! How can I help you today?',
        isCreatedByUser: false,
        user: 'assistant'
      };
      
      act(() => {
        setMockMessages([aiMessage]);
      });
      
      // Re-render to trigger message detection
      rerender(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      // Wait for AI response to be spoken
      await waitFor(() => {
        expect(window.speechSynthesis.speak).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'Hello! How can I help you today?'
          })
        );
      }, { timeout: 3000 });
    });

    test('should handle speech synthesis errors gracefully', async () => {
      const { rerender } = render(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      // Mock speech synthesis to trigger error
      (window.speechSynthesis.speak as jest.Mock).mockImplementationOnce((utterance) => {
        setTimeout(() => {
          if (utterance.onerror) {
            utterance.onerror(new Error('Speech synthesis failed'));
          }
        }, 50);
      });
      
      // Start continuous mode
      const button = screen.getByRole('button', { name: /continuous/i });
      await userEvent.click(button);
      
      // The error should be handled and not crash the app
      await waitFor(() => {
        expect(button).toBeInTheDocument();
      });
    });
  });

  describe('Feature 4: Resume listening after AI finishes', () => {
    test('should restart recognition after AI speech ends', async () => {
      const { rerender } = render(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      // Start continuous mode
      const button = screen.getByRole('button', { name: /continuous/i });
      await userEvent.click(button);
      
      // Wait for initial setup
      await waitFor(() => {
        expect(window.speechSynthesis.speak).toHaveBeenCalled();
      });
      
      // Trigger welcome message end
      if (mockUtteranceInstance.onend) {
        act(() => mockUtteranceInstance.onend());
      }
      
      // Clear mocks to track new calls
      mockRecognitionInstance.start.mockClear();
      
      // Simulate user interaction and AI response
      act(() => {
        recognitionEventHandlers.result?.({
          resultIndex: 0,
          results: [{
            isFinal: true,
            0: { transcript: 'Test message' }
          }]
        });
      });
      
      jest.useFakeTimers();
      act(() => jest.advanceTimersByTime(1500));
      jest.useRealTimers();
      
      // Add AI response
      act(() => {
        setMockMessages([{
          messageId: `msg-${messageIdCounter++}`,
          text: 'AI response',
          isCreatedByUser: false
        }]);
      });
      
      rerender(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      // Wait for AI speech to start
      await waitFor(() => {
        const calls = (window.speechSynthesis.speak as jest.Mock).mock.calls;
        expect(calls.some(call => call[0].text === 'AI response')).toBe(true);
      });
      
      // Get the utterance for AI response
      const aiUtterance = (window.speechSynthesis.speak as jest.Mock).mock.calls
        .find(call => call[0].text === 'AI response')?.[0];
      
      // Clear recognition start mock
      mockRecognitionInstance.start.mockClear();
      
      // Trigger AI speech end
      if (aiUtterance?.onend) {
        act(() => aiUtterance.onend());
      }
      
      // Recognition should restart after delay
      await waitFor(() => {
        expect(mockRecognitionInstance.start).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('Feature 5: Continue for multiple turns', () => {
    test('should handle 3+ conversation turns', async () => {
      const { rerender } = render(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      // Start continuous mode
      const button = screen.getByRole('button', { name: /continuous/i });
      await userEvent.click(button);
      
      // Complete initial setup
      await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
      if (mockUtteranceInstance.onend) {
        act(() => mockUtteranceInstance.onend());
      }
      
      const messages: any[] = [];
      
      // Simulate 3 turns
      for (let turn = 1; turn <= 3; turn++) {
        console.log(`\n=== TURN ${turn} ===`);
        
        // Clear mocks for this turn
        mockSetValue.mockClear();
        mockSubmitMessage.mockClear();
        
        // User speaks
        act(() => {
          recognitionEventHandlers.result?.({
            resultIndex: 0,
            results: [{
              isFinal: true,
              0: { transcript: `User message ${turn}` }
            }]
          });
        });
        
        // Trigger silence detection
        jest.useFakeTimers();
        act(() => jest.advanceTimersByTime(1500));
        jest.useRealTimers();
        
        // Verify submission
        expect(mockSetValue).toHaveBeenCalledWith('text', `User message ${turn}`);
        expect(mockSubmitMessage).toHaveBeenCalled();
        
        // Add AI response
        const aiMessage = {
          messageId: `msg-${messageIdCounter++}`,
          text: `AI response ${turn}`,
          isCreatedByUser: false
        };
        messages.push(aiMessage);
        
        act(() => {
          setMockMessages([...messages]);
        });
        
        // Re-render with new messages
        rerender(
          <RecoilRoot>
            <VoiceChatContinuous disabled={false} />
          </RecoilRoot>
        );
        
        // Wait for AI to speak
        await waitFor(() => {
          const calls = (window.speechSynthesis.speak as jest.Mock).mock.calls;
          expect(calls.some(call => call[0].text === `AI response ${turn}`)).toBe(true);
        });
        
        // Get the AI utterance
        const aiUtterance = (window.speechSynthesis.speak as jest.Mock).mock.calls
          .find(call => call[0].text === `AI response ${turn}`)?.[0];
        
        // Trigger AI speech end
        if (aiUtterance?.onend) {
          act(() => aiUtterance.onend());
        }
        
        // Wait a bit before next turn
        await waitFor(() => {
          expect(mockRecognitionInstance.start).toHaveBeenCalled();
        });
      }
      
      // Should still be in continuous mode
      expect(button).toHaveTextContent(/stop/i);
    });
  });

  describe('Feature 6: Show visual indicators of current state', () => {
    test('should show correct visual indicators during different states', async () => {
      const { container } = render(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      const button = screen.getByRole('button', { name: /continuous/i });
      
      // Initial state - inactive
      expect(button.querySelector('svg')).toHaveClass('text-muted-foreground');
      expect(button.querySelector('.bg-green-500')).not.toBeInTheDocument();
      
      // Start continuous mode
      await userEvent.click(button);
      
      // Active state - should show green
      await waitFor(() => {
        expect(button.querySelector('svg')).toHaveClass('text-green-500');
      });
      
      // Should show status indicator dot
      const statusDot = button.querySelector('span.absolute');
      expect(statusDot).toBeInTheDocument();
      expect(statusDot).toHaveClass('bg-green-500');
      expect(statusDot).toHaveClass('animate-pulse');
      
      // During AI speech - should show blue
      const aiMessage = {
        messageId: 'msg-1',
        text: 'AI is speaking',
        isCreatedByUser: false
      };
      
      act(() => {
        setMockMessages([aiMessage]);
      });
      
      // Need to trigger re-render and speech
      const { rerender } = render(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      // Icon should indicate speaking state
      await waitFor(() => {
        const updatedButton = screen.getByRole('button', { name: /continuous/i });
        expect(updatedButton.querySelector('svg')).toHaveClass('text-blue-500');
      });
    });

    test('should show waiting indicator when waiting for response', async () => {
      render(
        <RecoilRoot>
          <VoiceChatContinuous disabled={false} />
        </RecoilRoot>
      );
      
      const button = screen.getByRole('button', { name: /continuous/i });
      await userEvent.click(button);
      
      // Complete setup
      await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
      if (mockUtteranceInstance.onend) {
        act(() => mockUtteranceInstance.onend());
      }
      
      // Simulate user speaking
      act(() => {
        recognitionEventHandlers.result?.({
          resultIndex: 0,
          results: [{
            isFinal: true,
            0: { transcript: 'Test' }
          }]
        });
      });
      
      // Fast forward to submit
      jest.useFakeTimers();
      act(() => jest.advanceTimersByTime(1500));
      jest.useRealTimers();
      
      // Should show yellow waiting indicator
      await waitFor(() => {
        expect(button.querySelector('svg')).toHaveClass('text-yellow-500');
        const statusDot = button.querySelector('span.absolute');
        expect(statusDot).toHaveClass('bg-yellow-500');
      });
    });
  });
});