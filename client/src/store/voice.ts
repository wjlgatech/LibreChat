import { atom } from 'recoil';

export const voiceListeningState = atom<boolean>({
  key: 'voiceListening',
  default: false,
});

export const voiceTranscriptState = atom<{
  text: string;
  isFinal: boolean;
}>({
  key: 'voiceTranscript',
  default: {
    text: '',
    isFinal: false,
  },
});

export const voiceAIResponseState = atom<{
  text: string;
  isPlaying: boolean;
}>({
  key: 'voiceAIResponse',
  default: {
    text: '',
    isPlaying: false,
  },
});

export const voiceProcessingState = atom<boolean>({
  key: 'voiceProcessing',
  default: false,
});

export const voiceContinuousModeState = atom<boolean>({
  key: 'voiceContinuousMode',
  default: false,
});