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

describe('VoiceChatContinuousFinal - Button Activation Logic', () => {
  let mockSubmitMessage: jest.Mock;
  let mockAsk: jest.Mock;
  let mockSetValue: jest.Mock;
  let mockHandleSubmit: jest.Mock;
  let mockShowToast: jest.Mock;
  let VoiceChatContinuousFinal: any;

  beforeEach(async () => {
    // Mock window speech recognition BEFORE importing component
    (window as any).SpeechRecognition = jest.fn(() => mockSpeechRecognition);
    (window as any).webkitSpeechRecognition = jest.fn(() => mockSpeechRecognition);
    
    // Dynamically import component after mocks are set up
    const module = await import('../VoiceChatContinuousFinal');
    VoiceChatContinuousFinal = module.default;
    
    // Reset all mocks
    mockSpeechRecognition.start.mockClear();
    mockSpeechRecognition.stop.mockClear();
    mockSpeechRecognition.abort.mockClear();
    mockSpeechRecognition.onstart = null;
    mockSpeechRecognition.onresult = null;
    mockSpeechRecognition.onerror = null;
    mockSpeechRecognition.onend = null;

    // Mock URL params
    (useParams as jest.Mock).mockReturnValue({
      conversationId: 'test-conversation-123',
    });

    // Mock functions
    mockAsk = jest.fn();
    mockSubmitMessage = jest.fn();
    mockSetValue = jest.fn();
    mockHandleSubmit = jest.fn((callback) => () => {
      const data = { text: 'test' };
      callback(data);
    });
    mockShowToast = jest.fn();

    // Setup mocks
    (useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: mockSubmitMessage,
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: mockSetValue,
      handleSubmit: mockHandleSubmit,
    });

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: {
        conversationId: 'test-conversation-123',
        messages: [],
      },
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

  it('should START recognition when button is clicked ON', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    const button = screen.getByRole('button');
    
    console.log('Button attributes:', {
      disabled: button.getAttribute('disabled'),
      'aria-pressed': button.getAttribute('aria-pressed'),
      className: button.className,
    });
    
    // Check if SpeechRecognition is available
    console.log('SpeechRecognition available:', !!(window as any).SpeechRecognition);
    console.log('webkitSpeechRecognition available:', !!(window as any).webkitSpeechRecognition);
    
    // Button should be OFF initially
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(mockSpeechRecognition.start).not.toHaveBeenCalled();
    
    // Button should NOT be disabled
    expect(button).not.toBeDisabled();

    // Click to turn ON
    fireEvent.click(button);

    // Button should be ON
    expect(button).toHaveAttribute('aria-pressed', 'true');

    // Recognition should start
    await waitFor(() => {
      expect(mockSpeechRecognition.start).toHaveBeenCalledTimes(1);
    });

    // Simulate recognition starting successfully
    mockSpeechRecognition.onstart?.();

    // Recognition should NOT be aborted immediately
    expect(mockSpeechRecognition.abort).not.toHaveBeenCalled();

    // Simulate speech result
    const result = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Hello world' },
        isFinal: true,
      }],
    };
    mockSpeechRecognition.onresult?.(result as any);

    // Should still be active after receiving results
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(mockSpeechRecognition.abort).not.toHaveBeenCalled();
  });

  it('should STOP recognition when button is clicked OFF', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    const button = screen.getByRole('button');
    
    // Turn ON first
    fireEvent.click(button);
    await waitFor(() => {
      expect(mockSpeechRecognition.start).toHaveBeenCalledTimes(1);
    });

    // Clear mocks
    mockSpeechRecognition.start.mockClear();
    mockSpeechRecognition.abort.mockClear();

    // Click to turn OFF
    fireEvent.click(button);

    // Button should be OFF
    expect(button).toHaveAttribute('aria-pressed', 'false');

    // Recognition should be aborted
    expect(mockSpeechRecognition.abort).toHaveBeenCalledTimes(1);

    // Should NOT restart recognition
    mockSpeechRecognition.onend?.();
    
    await waitFor(() => {
      // Should NOT restart when button is OFF
      expect(mockSpeechRecognition.start).not.toHaveBeenCalled();
    }, { timeout: 1000 });
  });

  it('should NOT enter abort loop when active', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    const button = screen.getByRole('button');
    
    // Turn ON
    fireEvent.click(button);
    await waitFor(() => {
      expect(mockSpeechRecognition.start).toHaveBeenCalledTimes(1);
    });

    // Simulate an error (not abort)
    mockSpeechRecognition.onerror?.({ error: 'network' });

    // Should handle error gracefully
    expect(mockSpeechRecognition.abort).not.toHaveBeenCalled();

    // Simulate recognition ending naturally
    mockSpeechRecognition.onend?.();

    // Should restart after a delay (since button is still ON)
    await waitFor(() => {
      expect(mockSpeechRecognition.start).toHaveBeenCalledTimes(2);
    }, { timeout: 1000 });

    // Should NOT be in an abort loop
    expect(mockSpeechRecognition.abort).not.toHaveBeenCalled();
  });

  it('should handle recognition lifecycle correctly', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    const button = screen.getByRole('button');
    
    // Turn ON
    fireEvent.click(button);
    
    // Should start recognition
    await waitFor(() => {
      expect(mockSpeechRecognition.start).toHaveBeenCalledTimes(1);
    });

    // Simulate successful start
    mockSpeechRecognition.onstart?.();

    // Provide some speech results
    const result1 = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Hello' },
        isFinal: false,
      }],
    };
    mockSpeechRecognition.onresult?.(result1 as any);

    // Provide final result
    const result2 = {
      resultIndex: 0,
      results: [{
        0: { transcript: 'Hello world' },
        isFinal: true,
      }],
    };
    mockSpeechRecognition.onresult?.(result2 as any);

    // Wait for submission timeout (1500ms)
    await waitFor(() => {
      expect(mockAsk).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world',
        })
      );
    }, { timeout: 2000 });

    // Recognition should still be active
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(mockSpeechRecognition.abort).not.toHaveBeenCalled();
  });

  it('should not start recognition when button is OFF', async () => {
    render(
      <RecoilRoot>
        <VoiceChatContinuousFinal disabled={false} />
      </RecoilRoot>
    );

    const button = screen.getByRole('button');
    
    // Button should be OFF initially
    expect(button).toHaveAttribute('aria-pressed', 'false');

    // Simulate some events that might trigger recognition
    // but should be ignored when button is OFF
    
    // Wait to ensure no recognition starts
    await waitFor(() => {
      expect(mockSpeechRecognition.start).not.toHaveBeenCalled();
    }, { timeout: 1000 });
  });
});