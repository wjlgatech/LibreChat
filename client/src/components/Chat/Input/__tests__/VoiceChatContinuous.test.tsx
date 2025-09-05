/**
 * TDD Test Suite for VoiceChatContinuous component debugging
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

// Now import React and other modules
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoilRoot } from 'recoil';
import '@testing-library/jest-dom';

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
  useToastContext: () => ({ showToast: mockShowToast }),
  TooltipAnchor: ({ render }: any) => <div>{render}</div>,
}));

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ data: [] }),
}));

// Component - import after all mocks are set up
import VoiceChatContinuous from '../VoiceChatContinuous';

describe('Voice Chat Continuous - Debugging Test', () => {
  let recognitionEventHandlers: any = {};
  let utteranceEventHandlers: any = {};

  beforeEach(() => {
    jest.clearAllMocks();
    console.log('\n=== Starting new test ===\n');
    
    // Reset event handlers
    recognitionEventHandlers = {};
    utteranceEventHandlers = {};
    
    // Update mock instance behavior
    mockRecognitionInstance.start.mockImplementation(() => {
      console.log('TEST: recognition.start() called');
      console.log('TEST: recognition settings - continuous:', mockRecognitionInstance.continuous, 'interimResults:', mockRecognitionInstance.interimResults);
      // Simulate start event
      setTimeout(() => {
        console.log('TEST: Firing recognition start event');
        recognitionEventHandlers.start?.();
      }, 10);
    });
    
    mockRecognitionInstance.addEventListener.mockImplementation((event, handler) => {
      console.log(`TEST: recognition.addEventListener('${event}') registered`);
      recognitionEventHandlers[event] = handler;
    });
    
    mockUtteranceInstance.addEventListener.mockImplementation((event, handler) => {
      console.log(`TEST: utterance.addEventListener('${event}') registered`);
      utteranceEventHandlers[event] = handler;
    });
    
    (window.speechSynthesis.speak as jest.Mock).mockImplementation((utterance) => {
      console.log('TEST: speechSynthesis.speak() called with text:', utterance.text);
      // Simulate speech end after delay
      setTimeout(() => {
        console.log('TEST: Firing utterance start event');
        utteranceEventHandlers.start?.();
        setTimeout(() => {
          console.log('TEST: Firing utterance end event');
          utteranceEventHandlers.end?.();
        }, 100);
      }, 50);
    });
    
    (window.speechSynthesis.getVoices as jest.Mock).mockReturnValue([
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Microsoft David', lang: 'en-US' }
    ]);
  });

  test('Basic render and button functionality', async () => {
    console.log('TEST: Rendering component');
    render(
      <RecoilRoot>
        <VoiceChatContinuous disabled={false} />
      </RecoilRoot>
    );
    
    // Look for the button by its ID or aria-label
    const button = screen.getByRole('button', { name: /continuous/i });
    console.log('TEST: Found button with text:', button.textContent);
    console.log('TEST: Button disabled?', button.hasAttribute('disabled'));
    console.log('TEST: Button className:', button.className);
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  test('Click button to start continuous mode', async () => {
    console.log('TEST: Testing button click');
    render(
      <RecoilRoot>
        <VoiceChatContinuous disabled={false} />
      </RecoilRoot>
    );
    
    const button = screen.getByRole('button', { name: /continuous/i });
    console.log('TEST: Clicking button');
    await userEvent.click(button);
    
    // Wait for initializeContinuousMode to be called
    await waitFor(() => {
      // Log to see what's happening
      console.log('TEST: Waiting for speech synthesis...');
      console.log('TEST: speechSynthesis.speak calls:', (window.speechSynthesis.speak as jest.Mock).mock.calls.length);
    });
    
    // Wait for speech synthesis to be called
    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalled();
    }, { timeout: 3000 });
    
    console.log('TEST: Speech synthesis called');
    
    // Check what text was spoken
    const spokenText = mockUtteranceInstance.text;
    console.log('TEST: Spoken text:', spokenText);
    expect(spokenText).toContain('Continuous voice mode activated');
  });

  test('Speech recognition should start after welcome message', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuous disabled={false} />
      </RecoilRoot>
    );
    
    const button = screen.getByRole('button', { name: /continuous/i });
    await userEvent.click(button);
    
    // Wait for speech synthesis
    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalled();
    });
    
    // Wait for utterance end handler to be set
    await waitFor(() => {
      expect(utteranceEventHandlers.end).toBeDefined();
    });
    
    console.log('TEST: Utterance handlers:', Object.keys(utteranceEventHandlers));
    
    // Manually trigger utterance end
    act(() => {
      console.log('TEST: Manually triggering utterance end');
      utteranceEventHandlers.end?.();
    });
    
    // Wait for recognition to start
    await waitFor(() => {
      expect(mockRecognitionInstance.start).toHaveBeenCalled();
    }, { timeout: 3000 });
    
    console.log('TEST: Recognition started');
    console.log('TEST: Recognition continuous:', mockRecognitionInstance.continuous);
    console.log('TEST: Recognition interimResults:', mockRecognitionInstance.interimResults);
  });

  test('Speech recognition should handle results', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuous disabled={false} />
      </RecoilRoot>
    );
    
    const button = screen.getByRole('button', { name: /continuous/i });
    await userEvent.click(button);
    
    // Wait for speech synthesis
    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalled();
    });
    
    // Wait for utterance end handler and trigger it
    await waitFor(() => expect(utteranceEventHandlers.end).toBeDefined());
    act(() => utteranceEventHandlers.end?.());
    
    // Wait for recognition to start
    await waitFor(() => expect(mockRecognitionInstance.start).toHaveBeenCalled());
    
    // Check if result handler is registered
    console.log('TEST: Recognition handlers:', Object.keys(recognitionEventHandlers));
    expect(recognitionEventHandlers.result).toBeDefined();
    
    // Simulate speech result
    const mockEvent = {
      resultIndex: 0,
      results: [{
        isFinal: true,
        0: { transcript: 'Hello AI assistant' }
      }]
    };
    
    act(() => {
      console.log('TEST: Triggering speech result');
      recognitionEventHandlers.result?.(mockEvent);
    });
    
    // Check if setValue was called
    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('text', expect.stringContaining('Hello AI assistant'));
    });
    
    console.log('TEST: setValue calls:', mockSetValue.mock.calls);
  });
});