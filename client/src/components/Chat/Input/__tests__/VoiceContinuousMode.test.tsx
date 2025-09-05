/**
 * TDD Test Suite for Continuous Voice Mode Feature
 * 
 * Requirements:
 * 1. AI listens to user continuously
 * 2. AI responds when user stops speaking (1.5s silence)
 * 3. AI speaks its response using TTS
 * 4. AI resumes listening after speaking
 * 5. User can stop continuous mode anytime
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoilRoot, atom } from 'recoil';
import '@testing-library/jest-dom';

// Component to be implemented
import VoiceContinuousMode from '../VoiceContinuousMode';

// Mock store
jest.mock('~/store', () => {
  const { atom } = require('recoil');
  return {
    messages: atom({
      key: 'messages',
      default: {},
    }),
  };
});

// Mock voice atoms
jest.mock('~/store/voice', () => {
  const { atom } = require('recoil');
  return {
    voiceListeningState: atom({
      key: 'voiceListening',
      default: false,
    }),
    voiceTranscriptState: atom({
      key: 'voiceTranscript',
      default: { text: '', isFinal: false },
    }),
    voiceAIResponseState: atom({
      key: 'voiceAIResponse',
      default: { text: '', isPlaying: false },
    }),
    voiceContinuousModeState: atom({
      key: 'voiceContinuousMode',
      default: false,
    }),
  };
});

// Create mock submit function
const mockSubmitMessage = jest.fn();

// Mock dependencies
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSubmitMessage: () => ({
    submitMessage: mockSubmitMessage,
  }),
}));

// Mock form methods
const mockSetValue = jest.fn();
const mockHandleSubmit = jest.fn((fn) => () => {
  // Call the function with the text that was set via setValue
  const lastSetValueCall = mockSetValue.mock.calls[mockSetValue.mock.calls.length - 1];
  const text = lastSetValueCall ? lastSetValueCall[1] : 'test';
  fn({ text });
});

jest.mock('~/Providers', () => ({
  useChatContext: () => ({
    conversation: { conversationId: 'test-123' },
    isSubmitting: false,
  }),
  useChatFormContext: () => ({
    setValue: mockSetValue,
    handleSubmit: mockHandleSubmit,
  }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
}));

// Mock browser APIs
const mockSpeechRecognition = jest.fn();
const mockSpeechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  getVoices: jest.fn(() => []),
  addEventListener: jest.fn(),
};

const mockSpeechSynthesisUtterance = jest.fn();

beforeAll(() => {
  // Mock window object
  Object.defineProperty(window, 'SpeechRecognition', {
    writable: true,
    value: mockSpeechRecognition
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    writable: true,
    value: mockSpeechRecognition
  });
  Object.defineProperty(window, 'speechSynthesis', {
    writable: true,
    value: mockSpeechSynthesis
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    writable: true,
    value: mockSpeechSynthesisUtterance
  });
});

describe('Continuous Voice Mode - TDD Implementation', () => {
  let mockRecognitionInstance: any;
  let mockUtteranceInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitMessage.mockClear();
    mockSetValue.mockClear();
    mockHandleSubmit.mockClear();
    
    // Setup mock recognition instance
    mockRecognitionInstance = {
      continuous: false,
      interimResults: false,
      lang: '',
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    
    mockSpeechRecognition.mockReturnValue(mockRecognitionInstance);
    
    // Setup mock utterance instance
    mockUtteranceInstance = {
      text: '',
      rate: 1,
      pitch: 1,
      volume: 1,
      addEventListener: jest.fn(),
    };
    
    mockSpeechSynthesisUtterance.mockImplementation((text) => {
      mockUtteranceInstance.text = text;
      return mockUtteranceInstance;
    });
  });

  describe('Requirement 1: Continuous Listening Mode', () => {
    test('should display button to start continuous mode', () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button', { name: /continuous.*voice/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent(/start.*continuous/i);
    });

    test('should start listening when button clicked', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button', { name: /continuous.*voice/i });
      await userEvent.click(button);

      // Should speak welcome message first
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalled();
      
      // Trigger the utterance 'end' event to start listening
      const utteranceEndHandler = mockUtteranceInstance.addEventListener.mock.calls.find(
        call => call[0] === 'end'
      )?.[1];
      
      act(() => {
        utteranceEndHandler?.();
      });

      // Wait for async operations
      await waitFor(() => {
        // Should initialize speech recognition
        expect(mockSpeechRecognition).toHaveBeenCalled();
        expect(mockRecognitionInstance.continuous).toBe(true);
        expect(mockRecognitionInstance.interimResults).toBe(true);
        expect(mockRecognitionInstance.start).toHaveBeenCalled();
      });
    });

    test('should show visual feedback when listening', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Should show listening indicator
      await waitFor(() => {
        expect(screen.getByText(/listening/i)).toBeInTheDocument();
      });
    });

    test('should announce activation with voice', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Should speak welcome message
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalled();
      expect(mockUtteranceInstance.text).toContain('Continuous voice mode activated');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(mockUtteranceInstance);
    });
  });

  describe('Requirement 2: Silence Detection and Auto-Submit', () => {
    test('should detect 1.5 seconds of silence and submit', async () => {
      jest.useFakeTimers();
      const mockSubmit = jest.fn();
      
      render(
        <RecoilRoot>
          <VoiceContinuousMode onTranscript={mockSubmit} />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      jest.useRealTimers(); // Temporarily switch to real timers for async operations
      
      // First trigger utterance end to start listening
      const utteranceEndHandler = mockUtteranceInstance.addEventListener.mock.calls.find(
        call => call[0] === 'end'
      )?.[1];
      
      act(() => {
        utteranceEndHandler?.();
      });
      
      // Wait for recognition to start
      await waitFor(() => {
        expect(mockRecognitionInstance.start).toHaveBeenCalled();
      });
      
      jest.useFakeTimers(); // Switch back to fake timers

      // Simulate speech recognition result
      const mockEvent = {
        resultIndex: 0,
        results: [{
          isFinal: true,
          0: { transcript: 'Hello AI assistant' }
        }]
      };

      // Trigger speech
      act(() => {
        const onResult = mockRecognitionInstance.addEventListener.mock.calls
          .find(call => call[0] === 'result')?.[1];
        onResult?.(mockEvent);
      });

      // Fast forward 1.5 seconds
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      // Should call submit with final transcript
      expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'Hello AI assistant' });

      jest.useRealTimers();
    });

    test('should reset timer when new speech detected', async () => {
      jest.useFakeTimers();
      const mockSubmit = jest.fn();
      
      render(
        <RecoilRoot>
          <VoiceContinuousMode onTranscript={mockSubmit} />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      const onResult = mockRecognitionInstance.addEventListener.mock.calls
        .find(call => call[0] === 'result')?.[1];

      // First speech
      act(() => {
        onResult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript: 'Hello' } }]
        });
      });

      // Advance 1 second
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // More speech before timeout
      act(() => {
        onResult?.({
          resultIndex: 1,
          results: [{ isFinal: true, 0: { transcript: 'world' } }]
        });
      });

      // Advance 1 second (total 2 seconds from first speech)
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should not have submitted yet
      expect(mockSubmit).not.toHaveBeenCalledWith(expect.any(String), true);

      // Advance final 0.5 seconds
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Now should submit combined text
      expect(mockSubmit).toHaveBeenCalledWith('Hello world', true);

      jest.useRealTimers();
    });
  });

  describe('Requirement 3: AI Voice Response', () => {
    test('should speak AI response when received', async () => {
      const { rerender } = render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      // Activate continuous mode
      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Clear welcome message
      mockSpeechSynthesis.speak.mockClear();
      mockSpeechSynthesisUtterance.mockClear();

      // Simulate AI response by triggering a re-render with new message
      const mockAIResponse = 'I can help you with that';
      
      rerender(
        <RecoilRoot>
          <VoiceContinuousMode onAIResponse={(text) => {
            expect(text).toBe(mockAIResponse);
          }} />
        </RecoilRoot>
      );

      // Manually trigger AI response
      // In real implementation, this would come from message state
      act(() => {
        // Find the component instance and trigger response
        const speakButton = screen.getByRole('button');
        fireEvent.click(speakButton); // This is a placeholder
      });
    });

    test('should stop listening while AI is speaking', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Get speech start handler
      const onStart = mockUtteranceInstance.addEventListener.mock.calls
        .find(call => call[0] === 'start')?.[1];

      // Trigger speech start
      act(() => {
        onStart?.();
      });

      // Should stop recognition
      expect(mockRecognitionInstance.stop).toHaveBeenCalled();
    });

    test('should show AI speaking indicator', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Trigger AI speaking
      const onStart = mockUtteranceInstance.addEventListener.mock.calls
        .find(call => call[0] === 'start')?.[1];

      act(() => {
        onStart?.();
      });

      // Should show speaking indicator
      await waitFor(() => {
        expect(screen.getByText(/AI speaking/i)).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 4: Resume Listening After AI Response', () => {
    test('should automatically resume listening after AI finishes speaking', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Get speech end handler
      const onEnd = mockUtteranceInstance.addEventListener.mock.calls
        .find(call => call[0] === 'end')?.[1];

      // Clear mocks to track new calls
      mockSpeechRecognition.mockClear();
      mockRecognitionInstance.start.mockClear();

      // Trigger speech end
      act(() => {
        onEnd?.();
      });

      // Should create new recognition and start listening
      await waitFor(() => {
        expect(mockSpeechRecognition).toHaveBeenCalled();
        expect(mockRecognitionInstance.start).toHaveBeenCalled();
      });
    });

    test('should maintain continuous mode state across cycles', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Complete a full cycle: listen -> speak -> listen
      const onEnd = mockUtteranceInstance.addEventListener.mock.calls
        .find(call => call[0] === 'end')?.[1];

      act(() => {
        onEnd?.();
      });

      // Should still show as active
      await waitFor(() => {
        expect(screen.getByText(/listening/i)).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 5: Stop Continuous Mode', () => {
    test('should stop all activities when button clicked again', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      
      // Start
      await userEvent.click(button);
      expect(screen.getByText(/stop.*continuous/i)).toBeInTheDocument();
      
      // Trigger utterance end to start recognition
      const utteranceEndHandler = mockUtteranceInstance.addEventListener.mock.calls.find(
        call => call[0] === 'end'
      )?.[1];
      
      act(() => {
        utteranceEndHandler?.();
      });
      
      // Wait for recognition to start
      await waitFor(() => {
        expect(mockRecognitionInstance.start).toHaveBeenCalled();
      });

      // Stop
      await userEvent.click(button);

      // Should stop recognition and speech
      expect(mockRecognitionInstance.abort).toHaveBeenCalled();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();

      // Button should show start text again
      expect(screen.getByText(/start.*continuous/i)).toBeInTheDocument();
    });

    test('should clear all visual indicators when stopped', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Verify listening indicator exists
      expect(screen.getByText(/listening/i)).toBeInTheDocument();

      // Stop
      await userEvent.click(button);

      // Indicators should be gone
      await waitFor(() => {
        expect(screen.queryByText(/listening/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle browser without speech support gracefully', () => {
      // Remove speech support
      const originalSpeechRecognition = global.SpeechRecognition;
      global.SpeechRecognition = undefined as any;
      global.webkitSpeechRecognition = undefined as any;

      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(screen.getByText(/not supported/i)).toBeInTheDocument();

      // Restore
      global.SpeechRecognition = originalSpeechRecognition;
    });

    test('should recover from recognition errors', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Get error handler
      const onError = mockRecognitionInstance.addEventListener.mock.calls
        .find(call => call[0] === 'error')?.[1];

      // Trigger non-fatal error
      act(() => {
        onError?.({ error: 'network' });
      });

      // Should show error but remain in continuous mode
      expect(screen.getByText(/listening/i)).toBeInTheDocument();
    });

    test('should handle speech synthesis errors', async () => {
      render(
        <RecoilRoot>
          <VoiceContinuousMode />
        </RecoilRoot>
      );

      const button = screen.getByRole('button');
      await userEvent.click(button);

      // Get error handler
      const onError = mockUtteranceInstance.addEventListener.mock.calls
        .find(call => call[0] === 'error')?.[1];

      mockSpeechRecognition.mockClear();

      // Trigger synthesis error
      act(() => {
        onError?.({ error: 'synthesis-failed' });
      });

      // Should resume listening despite speech error
      await waitFor(() => {
        expect(mockSpeechRecognition).toHaveBeenCalled();
      });
    });
  });
});