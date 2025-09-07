import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize, useSpeechToText } from '~/hooks';
import { useChatContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

interface VoiceUnifiedSimpleProps {
  disabled?: boolean;
  ask: (data: { text: string }) => void;
  methods: any;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  isSubmitting: boolean;
}

export default function VoiceUnifiedSimple({ 
  disabled = false, 
  ask, 
  methods, 
  textAreaRef,
  isSubmitting: isFormSubmitting 
}: VoiceUnifiedSimpleProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { setValue, reset, getValues } = methods;
  
  const existingTextRef = useRef<string>('');

  const onTranscriptionComplete = useCallback(
    (text: string) => {
      if (isFormSubmitting) {
        showToast({
          message: localize('com_ui_speech_while_submitting'),
          status: 'error',
        });
        return;
      }
      if (text) {
        console.log('[VoiceUnifiedSimple] Transcription complete:', text);
        ask({ text });
        reset({ text: '' });
        existingTextRef.current = '';
      }
    },
    [ask, reset, showToast, localize, isFormSubmitting],
  );

  const setText = useCallback(
    (text: string) => {
      const newText = existingTextRef.current ? `${existingTextRef.current} ${text}` : text;
      setValue('text', newText, { shouldValidate: true });
    },
    [setValue],
  );

  const { isListening, isLoading, startRecording, stopRecording } = useSpeechToText(
    setText,
    onTranscriptionComplete,
  );

  if (!textAreaRef.current) {
    return null;
  }

  const handleStartRecording = async () => {
    existingTextRef.current = getValues('text') || '';
    console.log('[VoiceUnifiedSimple] Starting recording');
    startRecording();
  };

  const handleStopRecording = async () => {
    console.log('[VoiceUnifiedSimple] Stopping recording');
    stopRecording();
    existingTextRef.current = '';
  };

  return (
    <TooltipAnchor
      description={localize('com_ui_use_micrphone')}
      render={
        <button
          type="button"
          aria-label={localize('com_ui_use_micrphone')}
          onClick={isListening ? handleStopRecording : handleStartRecording}
          disabled={disabled}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
          )}
          aria-pressed={isListening}
        >
          {/* Sound wave icon */}
          <svg 
            className={cn('h-5 w-5 transition-colors', isListening ? 'text-red-500' : 'text-muted-foreground')}
            fill="none" 
            viewBox="0 0 24 24" 
            strokeWidth="2"
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
            {isListening && (
              <g className="animate-pulse">
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  d="M5 12h1M1 12h1m16 0h1m3 0h1M8 12h.01M16 12h.01"
                  opacity="0.5"
                />
              </g>
            )}
          </svg>
          {isListening && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          )}
        </button>
      }
    />
  );
}