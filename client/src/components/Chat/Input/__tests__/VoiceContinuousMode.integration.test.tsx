/**
 * Integration test for debugging continuous voice mode
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoilRoot } from 'recoil';
import '@testing-library/jest-dom';

// Component
import VoiceContinuousMode from '../VoiceContinuousMode';

// Mock all dependencies with console logs
const mockSubmitMessage = jest.fn((data) => {
  console.log('TEST: submitMessage called with:', data);
});

const mockSetValue = jest.fn((field, value) => {
  console.log('TEST: setValue called with:', field, value);
});

const mockHandleSubmit = jest.fn((fn) => () => {
  console.log('TEST: handleSubmit called');
  const lastSetValueCall = mockSetValue.mock.calls[mockSetValue.mock.calls.length - 1];
  const text = lastSetValueCall ? lastSetValueCall[1] : 'test';
  fn({ text });
});

const mockShowToast = jest.fn((toast) => {
  console.log('TEST: showToast called with:', toast);
});

// Mock modules
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
  useChatContext: () => ({ conversation: { conversationId: 'test-123' }, isSubmitting: false }),
  useChatFormContext: () => ({ setValue: mockSetValue, handleSubmit: mockHandleSubmit }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

describe('Voice Continuous Mode - Integration Debug', () => {
  let mockRecognition: any;
  let mockUtterance: any;
  let recognitionEventHandlers: any = {};
  let utteranceEventHandlers: any = {};

  beforeEach(() => {
    jest.clearAllMocks();
    console.log('\n=== Starting new test ===\n');
    
    // Reset event handlers
    recognitionEventHandlers = {};
    utteranceEventHandlers = {};
    
    // Mock recognition instance
    mockRecognition = {
      continuous: false,
      interimResults: false,
      start: jest.fn(() => {
        console.log('TEST: recognition.start() called');
        // Simulate start event
        setTimeout(() => {
          console.log('TEST: Firing recognition start event');
          recognitionEventHandlers.start?.();
        }, 10);
      }),
      stop: jest.fn(() => console.log('TEST: recognition.stop() called')),
      abort: jest.fn(() => console.log('TEST: recognition.abort() called')),
      addEventListener: jest.fn((event, handler) => {
        console.log(`TEST: recognition.addEventListener('${event}') registered`);
        recognitionEventHandlers[event] = handler;
      }),
      removeEventListener: jest.fn(),
    };
    
    // Mock utterance instance
    mockUtterance = {
      text: '',
      addEventListener: jest.fn((event, handler) => {
        console.log(`TEST: utterance.addEventListener('${event}') registered`);
        utteranceEventHandlers[event] = handler;
      }),
    };
    
    // Mock browser APIs
    Object.defineProperty(window, 'SpeechRecognition', {
      writable: true,
      value: jest.fn(() => {
        console.log('TEST: new SpeechRecognition() created');
        return mockRecognition;
      })
    });
    
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      writable: true,
      value: jest.fn(() => mockRecognition)
    });
    
    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      value: {
        speak: jest.fn((utterance) => {
          console.log('TEST: speechSynthesis.speak() called with text:', utterance.text);
          // Simulate speech end after delay
          setTimeout(() => {
            console.log('TEST: Firing utterance end event');
            utteranceEventHandlers.end?.();
          }, 100);
        }),
        cancel: jest.fn(() => console.log('TEST: speechSynthesis.cancel() called')),
        getVoices: jest.fn(() => []),
      }
    });
    
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      writable: true,
      value: jest.fn((text) => {
        console.log('TEST: new SpeechSynthesisUtterance() created with text:', text);
        mockUtterance.text = text;
        return mockUtterance;
      })
    });
  });

  test('DIAGNOSTIC: Full flow - click, speak, silence, submit', async () => {
    console.log('TEST: Rendering component');
    render(
      <RecoilRoot>
        <VoiceContinuousMode />
      </RecoilRoot>
    );
    
    const button = screen.getByRole('button', { name: /continuous.*voice/i });
    console.log('TEST: Found button:', button.textContent);
    
    // Click to start
    console.log('TEST: Clicking button to start');
    await userEvent.click(button);
    
    // Wait for welcome message
    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalled();
    });
    console.log('TEST: Welcome message spoken');
    
    // Wait for utterance to end and recognition to start
    await waitFor(() => {
      expect(utteranceEventHandlers.end).toBeDefined();
    });
    
    // Trigger utterance end
    console.log('TEST: Triggering utterance end event');
    act(() => {
      utteranceEventHandlers.end?.();
    });
    
    // Wait for recognition to start
    await waitFor(() => {
      expect(mockRecognition.start).toHaveBeenCalled();
      expect(mockRecognition.continuous).toBe(true);
      expect(mockRecognition.interimResults).toBe(true);
    });
    console.log('TEST: Recognition started with correct settings');
    
    // Simulate speech recognition result
    console.log('TEST: Simulating speech result');
    act(() => {
      recognitionEventHandlers.result?.({
        resultIndex: 0,
        results: [{
          isFinal: true,
          0: { transcript: 'Hello AI assistant' }
        }]
      });
    });
    
    // Check if transcript was set
    console.log('TEST: Checking if setValue was called');
    
    // Use fake timers for silence detection
    jest.useFakeTimers();
    
    // Fast forward 1.5 seconds
    console.log('TEST: Advancing time by 1.5 seconds for silence detection');
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    
    // Check if message was submitted
    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('text', 'Hello AI assistant');
      expect(mockSubmitMessage).toHaveBeenCalled();
    });
    
    console.log('TEST: Message submitted successfully');
    console.log('TEST: setValue calls:', mockSetValue.mock.calls);
    console.log('TEST: submitMessage calls:', mockSubmitMessage.mock.calls);
    
    jest.useRealTimers();
  });

  test('DIAGNOSTIC: Check recognition event handlers', async () => {
    render(
      <RecoilRoot>
        <VoiceContinuousMode />
      </RecoilRoot>
    );
    
    const button = screen.getByRole('button');
    await userEvent.click(button);
    
    // Wait for utterance end handler
    await waitFor(() => {
      expect(utteranceEventHandlers.end).toBeDefined();
    });
    
    // Trigger utterance end
    act(() => {
      utteranceEventHandlers.end?.();
    });
    
    // Wait and check registered event handlers
    await waitFor(() => {
      expect(mockRecognition.addEventListener).toHaveBeenCalled();
    });
    
    console.log('TEST: Registered recognition event handlers:', Object.keys(recognitionEventHandlers));
    expect(recognitionEventHandlers.start).toBeDefined();
    expect(recognitionEventHandlers.result).toBeDefined();
    expect(recognitionEventHandlers.error).toBeDefined();
    expect(recognitionEventHandlers.end).toBeDefined();
  });
});