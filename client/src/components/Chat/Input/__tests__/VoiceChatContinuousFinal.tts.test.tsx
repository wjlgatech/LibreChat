import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import VoiceChatContinuousFinal from '../VoiceChatContinuousFinal';
import ChatForm from '../ChatForm';
import store from '~/store';

// Mock modules
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSubmitMessage: () => ({ 
    submitMessage: jest.fn(), 
    ask: jest.fn() 
  }),
  useToastContext: () => ({ 
    showToast: jest.fn() 
  }),
  useAuthContext: () => ({
    token: 'mock-token'
  }),
  useTextarea: () => ({
    isNotAppendable: false,
    handlePaste: jest.fn(),
    handleKeyDown: jest.fn(),
    handleCompositionStart: jest.fn(),
    handleCompositionEnd: jest.fn(),
  }),
  useAutoSave: () => {},
  useRequiresKey: () => ({ requiresKey: false }),
  useHandleKeyUp: () => jest.fn(),
  useQueryParams: () => {},
  useFocusChatEffect: () => {},
  useCustomAudioRef: () => ({ audioRef: { current: null } }),
  usePauseGlobalAudio: () => ({ pauseGlobalAudio: jest.fn() }),
}));

// Mock StreamAudio first to track its rendering
jest.mock('../StreamAudio', () => {
  return jest.fn(({ index }) => {
    console.log('[Test] StreamAudio rendered with index:', index);
    return <div data-testid="stream-audio">StreamAudio Mock</div>;
  });
});

jest.mock('~/Providers', () => ({
  useChatFormContext: () => ({
    conversationId: 'test-conversation-id',
    newConversation: false,
    methods: {
      reset: jest.fn(),
      getValues: jest.fn(() => ({ text: '' })),
      setValue: jest.fn(),
      handleSubmit: jest.fn((cb) => () => cb()),
      control: {},
      register: jest.fn(() => ({ 
        ref: jest.fn(),
        onChange: jest.fn(),
        onBlur: jest.fn(),
        name: 'text'
      })),
    },
  }),
  useChatContext: () => ({
    conversation: { 
      conversationId: 'test-conversation-id',
      messages: []
    },
    isSubmitting: false,
    latestMessage: null,
    ask: jest.fn(),
    files: [],
    setFiles: jest.fn(),
    filesLoading: false,
    newConversation: false,
    handleStopGenerating: jest.fn(),
  }),
  useAddedChatContext: () => ({
    addedIndex: 1,
    generateConversation: jest.fn(),
    conversation: null,
    setConversation: jest.fn(),
    isSubmitting: false,
  }),
  useAssistantsMapContext: () => ({}),
}));

// Mock other components
jest.mock('../Files/AttachFileChat', () => () => null);
jest.mock('../Files/FileFormChat', () => () => null);
jest.mock('../TextareaHeader', () => () => null);
jest.mock('../PromptsCommand', () => () => null);
jest.mock('../CollapseChat', () => () => null);
jest.mock('../StopButton', () => () => null);
jest.mock('../SendButton', () => () => <button data-testid="send-button">Send</button>);
jest.mock('../EditBadges', () => () => null);
jest.mock('../BadgeRow', () => () => null);
jest.mock('../Mention', () => () => null);
jest.mock('../VoiceChat', () => () => null);
jest.mock('../AudioRecorder', () => () => null);

// Get the mocked module for StreamAudio
const MockStreamAudio = require('../StreamAudio');

// Track state changes - must be outside of describe block for jest.mock to access
let mockAutomaticPlaybackState = false;
let mockTextToSpeechState = true;

// Mock Recoil hooks with state tracking - must be before describe
jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: (atom: any) => {
    if (atom.key === 'textToSpeech') return mockTextToSpeechState;
    if (atom.key === 'automaticPlayback') return mockAutomaticPlaybackState;
    if (atom.key === 'globalAudioPlayingByIndex') return false;
    if (atom.key === 'SpeechToText') return true;
    if (atom.key === 'TextToSpeech') return mockTextToSpeechState;
    if (atom.key === 'chatDirection') return 'ltr';
    if (atom.key === 'maximizeChatSpace') return false;
    if (atom.key === 'centerFormOnLanding') return false;
    if (atom.key === 'isTemporary') return false;
    if (atom.key === 'chatBadges') return [];
    if (atom.key === 'isEditingBadges') return false;
    if (atom.key === 'showStopButtonByIndex') return false;
    if (atom.key === 'showPlusPopoverByIndex') return false;
    if (atom.key === 'showMentionPopoverByIndex') return false;
    if (atom.key === 'latestMessageByIndex') return null;
    if (atom.key === 'isSubmittingByIndex') return false;
    return null;
  },
  useSetRecoilState: (atom: any) => {
    if (atom.key === 'automaticPlayback') {
      return (value: boolean) => {
        console.log('[Test] Setting automaticPlayback to:', value);
        mockAutomaticPlaybackState = value;
      };
    }
    return jest.fn();
  },
  useRecoilState: (atom: any) => {
    if (atom.key === 'chatBadges') return [[], jest.fn()];
    if (atom.key === 'isEditingBadges') return [false, jest.fn()];
    if (atom.key === 'showStopButtonByIndex') return [false, jest.fn()];
    if (atom.key === 'showPlusPopoverByIndex') return [false, jest.fn()];
    if (atom.key === 'showMentionPopoverByIndex') return [false, jest.fn()];
    return [null, jest.fn()];
  },
}));

describe('VoiceChatContinuousFinal - TTS Integration', () => {
  let queryClient: QueryClient;
  let recognitionInstance: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock speech recognition
    recognitionInstance = {
      continuous: false,
      interimResults: false,
      lang: 'en-US',
      onstart: null,
      onresult: null,
      onend: null,
      onerror: null,
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
    };

    global.webkitSpeechRecognition = jest.fn(() => recognitionInstance) as any;

    // Reset states
    mockAutomaticPlaybackState = false;
    mockTextToSpeechState = true;
    MockStreamAudio.mockClear();
    jest.clearAllMocks();
  });

  const renderComponents = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <BrowserRouter>
            <div>
              <ChatForm index={0} />
            </div>
          </BrowserRouter>
        </RecoilRoot>
      </QueryClientProvider>
    );
  };

  it('renders StreamAudio when TTS is enabled and automaticPlayback is true', async () => {
    mockTextToSpeechState = true;
    mockAutomaticPlaybackState = true;
    
    renderComponents();

    // StreamAudio should be rendered when both conditions are met
    await waitFor(() => {
      expect(MockStreamAudio).toHaveBeenCalled();
      expect(screen.getByTestId('stream-audio')).toBeInTheDocument();
    });
  });

  it('does not render StreamAudio when automaticPlayback is false', () => {
    mockTextToSpeechState = true;
    mockAutomaticPlaybackState = false;
    
    renderComponents();

    // StreamAudio should NOT be rendered
    expect(MockStreamAudio).not.toHaveBeenCalled();
    expect(screen.queryByTestId('stream-audio')).not.toBeInTheDocument();
  });

  it('enables automaticPlayback when continuous voice is activated', async () => {
    mockTextToSpeechState = true;
    mockAutomaticPlaybackState = false;
    
    const { rerender } = renderComponents();

    // Initially StreamAudio should not be rendered
    expect(MockStreamAudio).not.toHaveBeenCalled();

    // Find and click the continuous voice button
    const voiceButton = screen.getByRole('button', { name: /com_ui_voice_continuous/i });
    fireEvent.click(voiceButton);

    // Wait for state update
    await waitFor(() => {
      expect(mockAutomaticPlaybackState).toBe(true);
    });

    // Re-render to see the updated state
    rerender(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <BrowserRouter>
            <div>
              <ChatForm index={0} />
            </div>
          </BrowserRouter>
        </RecoilRoot>
      </QueryClientProvider>
    );

    // Now StreamAudio should be rendered
    await waitFor(() => {
      expect(MockStreamAudio).toHaveBeenCalled();
      expect(screen.getByTestId('stream-audio')).toBeInTheDocument();
    });
  });

  it('disables automaticPlayback when continuous voice is deactivated', async () => {
    mockTextToSpeechState = true;
    mockAutomaticPlaybackState = false;
    
    renderComponents();

    // Activate continuous voice
    const voiceButton = screen.getByRole('button', { name: /com_ui_voice_continuous/i });
    fireEvent.click(voiceButton);

    await waitFor(() => {
      expect(mockAutomaticPlaybackState).toBe(true);
    });

    // Deactivate continuous voice
    fireEvent.click(voiceButton);

    await waitFor(() => {
      expect(mockAutomaticPlaybackState).toBe(false);
    });
  });
});