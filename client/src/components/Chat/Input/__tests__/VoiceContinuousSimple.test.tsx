import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoilRoot } from 'recoil';
import '@testing-library/jest-dom';

// Set up browser API mocks
const mockRecognition = {
  continuous: false,
  interimResults: false,
  lang: '',
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
};

const mockUtterance = {
  text: '',
  rate: 1,
  pitch: 1,
  volume: 1,
  onstart: null,
  onend: null,
  onerror: null,
};

Object.defineProperty(window, 'webkitSpeechRecognition', {
  writable: true,
  value: jest.fn(() => mockRecognition)
});

Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: {
    speak: jest.fn((utterance) => {
      console.log('TEST: speechSynthesis.speak called with:', utterance.text);
      // Simulate async speech
      setTimeout(() => {
        if (utterance.onstart) utterance.onstart();
        setTimeout(() => {
          if (utterance.onend) utterance.onend();
        }, 100);
      }, 50);
    }),
    cancel: jest.fn(),
    getVoices: jest.fn(() => []),
  }
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  writable: true,
  value: jest.fn((text) => {
    mockUtterance.text = text;
    return mockUtterance;
  })
});

// Mock dependencies
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSubmitMessage: () => ({ submitMessage: jest.fn() }),
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ 
    conversation: { conversationId: 'test-123' }, 
    isSubmitting: false 
  }),
  useChatFormContext: () => ({ 
    setValue: jest.fn(), 
    handleSubmit: jest.fn() 
  }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
  TooltipAnchor: ({ render }: any) => <div>{render}</div>,
}));

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ data: [] }),
}));

// Import component
import VoiceChatContinuous from '../VoiceChatContinuousFixed3';

describe('Voice Continuous Mode - Simple Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should enable and speak welcome message when clicked', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuous disabled={false} />
      </RecoilRoot>
    );
    
    const button = screen.getByRole('button', { name: /continuous/i });
    
    // Button should be enabled
    expect(button).not.toBeDisabled();
    
    // Click to start
    await userEvent.click(button);
    
    // Should speak welcome message
    await waitFor(() => {
      expect(window.speechSynthesis.speak).toHaveBeenCalled();
      const utterance = (window.SpeechSynthesisUtterance as jest.Mock).mock.results[0].value;
      expect(utterance.text).toContain('Continuous voice mode activated');
    }, { timeout: 3000 });
    
    // Icon should change color
    const svg = button.querySelector('svg');
    expect(svg).toHaveClass('text-green-500');
  });
});