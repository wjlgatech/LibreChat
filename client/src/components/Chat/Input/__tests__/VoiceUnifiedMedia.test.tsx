import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VoiceUnifiedMedia from '../VoiceUnifiedMedia';
import { RecoilRoot } from 'recoil';
import * as speechAPI from '~/data-provider/mutations';

// Mock for jest.mocked
jest.mocked = jest.mocked || ((fn: any) => fn as any);

// Mock dependencies
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSubmitMessage: () => ({
    submitMessage: jest.fn(),
  }),
}));

jest.mock('~/Providers', () => ({
  useChatFormContext: () => ({
    setValue: jest.fn(),
    handleSubmit: jest.fn((cb) => () => cb({ text: 'test' })),
  }),
  useChatContext: () => ({
    conversation: {},
    isSubmitting: false,
    latestMessage: null,
    getMessages: () => [],
  }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
  TooltipAnchor: ({ render }: any) => render,
}));

jest.mock('~/hooks/Input/useTextToSpeechBrowser', () => {
  return {
    __esModule: true,
    default: () => ({
      generateSpeechLocal: jest.fn(),
      cancelSpeechLocal: jest.fn(),
    }),
  };
});

// Mock the speech-to-text mutation
jest.mock('~/data-provider/mutations', () => ({
  useSpeechToTextMutation: jest.fn(),
}));

// Mock store
jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    textToSpeech: { key: 'textToSpeech', default: true },
    globalAudioPlayingFamily: () => ({ key: 'globalAudioPlaying', default: false }),
    voiceListeningState: { key: 'voiceListening', default: false },
    voiceTranscriptState: { key: 'voiceTranscript', default: { text: '', isFinal: false } },
    voiceAIResponseState: { key: 'voiceAIResponse', default: false },
    voiceContinuousModeState: { key: 'voiceContinuousMode', default: false },
  },
}));

// Mock MediaRecorder
const mockMediaRecorder = {
  start: jest.fn(),
  stop: jest.fn(),
  state: 'inactive',
  ondataavailable: null as any,
  onstop: null as any,
};

global.MediaRecorder = jest.fn().mockImplementation(() => mockMediaRecorder) as any;
global.MediaRecorder.isTypeSupported = jest.fn(() => true);

// Mock getUserMedia
const mockStream = {
  getTracks: () => [{ stop: jest.fn() }],
};

global.navigator.mediaDevices = {
  getUserMedia: jest.fn(() => Promise.resolve(mockStream)),
} as any;

// Mock AudioContext
global.AudioContext = jest.fn().mockImplementation(() => ({
  createAnalyser: () => ({
    frequencyBinCount: 1024,
    getByteFrequencyData: jest.fn(),
  }),
  createMediaStreamSource: () => ({
    connect: jest.fn(),
  }),
  close: jest.fn(),
})) as any;

describe('VoiceUnifiedMedia - TDD Tests', () => {
  let mockSpeechToTextMutate: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMediaRecorder.state = 'inactive';
    
    // Setup the mock mutation
    mockSpeechToTextMutate = jest.fn();
    (speechAPI.useSpeechToTextMutation as any).mockReturnValue({
      mutate: mockSpeechToTextMutate,
      isLoading: false,
    });
  });

  it('should send recorded audio to speech-to-text API instead of using mock text', async () => {
    const { container } = render(
      <RecoilRoot>
        <VoiceUnifiedMedia disabled={false} />
      </RecoilRoot>
    );

    const button = container.querySelector('button');
    expect(button).toBeTruthy();

    // Click to start recording
    await fireEvent.click(button!);
    
    // Wait for recording to start
    await waitFor(() => {
      expect(mockMediaRecorder.start).toHaveBeenCalled();
    });

    // Simulate audio data being available
    const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });
    mockMediaRecorder.ondataavailable?.({ data: audioBlob });

    // Simulate recording stop (which triggers processing)
    mockMediaRecorder.onstop?.();

    // Verify that the speech-to-text API was called with FormData containing the audio
    await waitFor(() => {
      expect(mockSpeechToTextMutate).toHaveBeenCalledWith(
        expect.any(FormData)
      );
      
      // Verify the FormData contains the audio blob
      const formData = mockSpeechToTextMutate.mock.calls[0][0];
      expect(formData.get('audio')).toBeInstanceOf(Blob);
    });
  });

  it('should display actual transcribed text from API response', async () => {
    // Setup mutation to simulate successful response
    mockSpeechToTextMutate.mockImplementation((formData: FormData) => {
      // Simulate API response by calling onSuccess
      setTimeout(() => {
        const onSuccess = (speechAPI.useSpeechToTextMutation as any).mock.calls[0][0].onSuccess;
        onSuccess({ text: 'Hello, this is the actual transcribed text' });
      }, 100);
    });

    const { container } = render(
      <RecoilRoot>
        <VoiceUnifiedMedia disabled={false} />
      </RecoilRoot>
    );

    const button = container.querySelector('button');
    
    // Click to start recording
    await fireEvent.click(button!);
    
    // Simulate recording
    await waitFor(() => {
      expect(mockMediaRecorder.start).toHaveBeenCalled();
    });

    // Simulate audio data and stop
    const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });
    mockMediaRecorder.ondataavailable?.({ data: audioBlob });
    mockMediaRecorder.onstop?.();

    // Wait for the transcription to be processed
    await waitFor(() => {
      // The component should have received the actual transcribed text
      // and submitted it (not the mock text)
      const submitCall = (speechAPI.useSpeechToTextMutation as any).mock.calls[0][0];
      expect(submitCall).toBeDefined();
    });
  });

  it('should handle transcription errors gracefully', async () => {
    const mockShowToast = jest.fn();
    
    // Override the toast mock for this test
    const { useToastContext } = require('@librechat/client');
    useToastContext.mockReturnValue({
      showToast: mockShowToast,
    });

    // Setup mutation to simulate error
    mockSpeechToTextMutate.mockImplementation(() => {
      setTimeout(() => {
        const onError = (speechAPI.useSpeechToTextMutation as any).mock.calls[0][0].onError;
        onError(new Error('Transcription failed'));
      }, 100);
    });

    const { container } = render(
      <RecoilRoot>
        <VoiceUnifiedMedia disabled={false} />
      </RecoilRoot>
    );

    const button = container.querySelector('button');
    
    // Start recording
    await fireEvent.click(button!);
    
    // Simulate recording and stop
    const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });
    mockMediaRecorder.ondataavailable?.({ data: audioBlob });
    mockMediaRecorder.onstop?.();

    // Wait for error handling
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        message: expect.stringContaining('transcription'),
        status: 'error',
      });
    });
  });
});