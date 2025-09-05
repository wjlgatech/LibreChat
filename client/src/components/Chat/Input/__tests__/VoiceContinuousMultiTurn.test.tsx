/**
 * Test for multi-turn continuous voice conversation
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoilRoot } from 'recoil';
import '@testing-library/jest-dom';

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
    getVoices: jest.fn(() => []),
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
const addMockMessage = (message: any) => {
  mockMessages = [...mockMessages, message];
};

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ data: mockMessages }),
}));

// Import component after all mocks are set up
import VoiceChatContinuous from '../VoiceChatContinuousFixed2';

describe('Voice Continuous Mode - Multi-turn Test', () => {
  let recognitionEventHandlers: any = {};
  let utteranceEventHandlers: any = {};
  let messageIdCounter = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = [];
    messageIdCounter = 1;
    
    // Reset event handlers
    recognitionEventHandlers = {};
    utteranceEventHandlers = {};
    
    // Mock recognition behavior
    mockRecognitionInstance.start.mockImplementation(() => {
      console.log('TEST: Recognition started');
      setTimeout(() => recognitionEventHandlers.start?.(), 10);
    });
    
    mockRecognitionInstance.addEventListener.mockImplementation((event, handler) => {
      recognitionEventHandlers[event] = handler;
    });
    
    // Mock utterance behavior
    mockUtteranceInstance.addEventListener.mockImplementation((event, handler) => {
      utteranceEventHandlers[event] = handler;
    });
    
    (window.speechSynthesis.speak as jest.Mock).mockImplementation((utterance) => {
      console.log('TEST: Speaking:', utterance.text);
      setTimeout(() => {
        utteranceEventHandlers.start?.();
        setTimeout(() => {
          utteranceEventHandlers.end?.();
        }, 100);
      }, 50);
    });
  });

  test('Multi-turn conversation flow', async () => {
    const { rerender } = render(
      <RecoilRoot>
        <VoiceChatContinuous disabled={false} />
      </RecoilRoot>
    );
    
    // Click to start continuous mode
    const button = screen.getByRole('button', { name: /continuous/i });
    await userEvent.click(button);
    
    // Wait for welcome message
    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalled();
    });
    
    // Trigger utterance end to start listening
    act(() => utteranceEventHandlers.end?.());
    
    await waitFor(() => {
      expect(mockRecognitionInstance.start).toHaveBeenCalled();
    });
    
    // TURN 1: User speaks
    console.log('\n=== TURN 1: User speaks ===');
    act(() => {
      recognitionEventHandlers.result?.({
        resultIndex: 0,
        results: [{
          isFinal: true,
          0: { transcript: 'Hello AI, how are you?' }
        }]
      });
    });
    
    // Fast forward to trigger silence detection
    jest.useFakeTimers();
    act(() => jest.advanceTimersByTime(1500));
    jest.useRealTimers();
    
    // Verify message was submitted
    expect(mockSetValue).toHaveBeenCalledWith('text', 'Hello AI, how are you?');
    expect(mockSubmitMessage).toHaveBeenCalled();
    
    // TURN 1: Simulate AI response
    console.log('\n=== TURN 1: AI responds ===');
    const aiResponse1 = {
      messageId: `msg-${messageIdCounter++}`,
      text: "I'm doing well, thank you! How can I help you today?",
      isCreatedByUser: false
    };
    addMockMessage(aiResponse1);
    
    // Re-render to trigger effect with new messages
    rerender(
      <RecoilRoot>
        <VoiceChatContinuous disabled={false} />
      </RecoilRoot>
    );
    
    // Wait for AI to speak
    await waitFor(() => {
      const calls = (window.speechSynthesis.speak as jest.Mock).mock.calls;
      expect(calls.some(call => call[0].text.includes("I'm doing well"))).toBe(true);
    });
    
    // Trigger AI speech end to resume listening
    act(() => utteranceEventHandlers.end?.());
    
    // Wait for recognition to restart
    await waitFor(() => {
      expect(mockRecognitionInstance.start).toHaveBeenCalledTimes(2);
    });
    
    // TURN 2: User speaks again
    console.log('\n=== TURN 2: User speaks ===');
    mockSetValue.mockClear();
    mockSubmitMessage.mockClear();
    
    act(() => {
      recognitionEventHandlers.result?.({
        resultIndex: 0,
        results: [{
          isFinal: true,
          0: { transcript: 'Can you tell me about the weather?' }
        }]
      });
    });
    
    // Fast forward for silence detection
    jest.useFakeTimers();
    act(() => jest.advanceTimersByTime(1500));
    jest.useRealTimers();
    
    // Verify second message was submitted
    expect(mockSetValue).toHaveBeenCalledWith('text', 'Can you tell me about the weather?');
    expect(mockSubmitMessage).toHaveBeenCalled();
    
    // TURN 2: Simulate second AI response
    console.log('\n=== TURN 2: AI responds again ===');
    const aiResponse2 = {
      messageId: `msg-${messageIdCounter++}`,
      text: "I'd be happy to help with weather information!",
      isCreatedByUser: false
    };
    addMockMessage(aiResponse2);
    
    rerender(
      <RecoilRoot>
        <VoiceChatContinuous disabled={false} />
      </RecoilRoot>
    );
    
    // Wait for second AI response to be spoken
    await waitFor(() => {
      const calls = (window.speechSynthesis.speak as jest.Mock).mock.calls;
      expect(calls.some(call => call[0].text.includes("weather information"))).toBe(true);
    });
    
    // Verify continuous mode is still active
    expect(button).toHaveTextContent(/stop/i);
    
    // Click to stop continuous mode
    await userEvent.click(button);
    
    // Verify cleanup
    expect(mockRecognitionInstance.abort).toHaveBeenCalled();
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });
});