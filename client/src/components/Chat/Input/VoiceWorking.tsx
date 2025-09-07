import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import useTextToSpeechBrowser from '~/hooks/Input/useTextToSpeechBrowser';
import { cn } from '~/utils';
import { 
  voiceListeningState, 
  voiceTranscriptState,
  voiceContinuousModeState 
} from '~/store/voice';
import store from '~/store';

interface VoiceWorkingProps {
  disabled?: boolean;
  ask: (data: { text: string }) => void;
  methods: any;
}

export default function VoiceWorking({ disabled = false, ask, methods }: VoiceWorkingProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { setValue, reset } = methods;
  const { isSubmitting, latestMessage } = useChatContext();
  
  // Check if STT is enabled and the engine type
  const speechToTextEnabled = useRecoilValue(store.speechToText);
  const engineSTT = useRecoilValue(store.engineSTT);
  const textToSpeech = useRecoilValue(store.textToSpeech);
  
  // Voice states
  const setListening = useSetRecoilState(voiceListeningState);
  const setTranscript = useSetRecoilState(voiceTranscriptState);
  const setContinuousMode = useSetRecoilState(voiceContinuousModeState);
  
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  
  // TTS
  const { generateSpeechLocal, cancelSpeechLocal } = useTextToSpeechBrowser({ setIsSpeaking });
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const lastMessageIdRef = useRef<string | null>(null);
  const isActiveRef = useRef(false);
  const shouldRestartRef = useRef(false);
  
  // Keep refs in sync
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  
  const handleSubmit = useCallback((text: string) => {
    console.log('[VoiceWorking] Submitting:', text);
    setIsWaitingForResponse(true);
    ask({ text });
    reset({ text: '' });
    setTranscript({ text: '', isFinal: false });
    finalTranscriptRef.current = '';
  }, [ask, reset, setTranscript]);
  
  const startRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      showToast({
        message: 'Speech recognition not supported',
        status: 'error',
      });
      setIsActive(false);
      return;
    }
    
    // Clean up any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.log('[VoiceWorking] Error aborting existing recognition:', e);
      }
      recognitionRef.current = null;
    }
    
    console.log('[VoiceWorking] Starting recognition');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false; // Use single utterance mode
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognitionRef.current = recognition;
    
    let hasStarted = false;
    
    recognition.onstart = () => {
      hasStarted = true;
      console.log('[VoiceWorking] Recognition started successfully');
      setListening(true);
      setTranscript({ text: '🎤 Listening...', isFinal: false });
      finalTranscriptRef.current = '';
    };
    
    recognition.onresult = (event: any) => {
      console.log('[VoiceWorking] Got result, results length:', event.results.length);
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        console.log('[VoiceWorking] Result', i, 'isFinal:', event.results[i].isFinal, 'transcript:', transcript);
        if (event.results[i].isFinal) {
          finalTranscriptRef.current = transcript;
          console.log('[VoiceWorking] Final transcript set:', transcript);
        } else {
          interimTranscript = transcript;
        }
      }
      
      const displayText = finalTranscriptRef.current || interimTranscript || '🎤 Listening...';
      console.log('[VoiceWorking] Setting display text:', displayText);
      setTranscript({ text: displayText, isFinal: false });
      setValue('text', displayText);
    };
    
    recognition.onerror = (event: any) => {
      console.log('[VoiceWorking] Recognition error:', event.error);
      
      if (event.error === 'no-speech') {
        // No speech detected, restart if still active
        if (isActiveRef.current) {
          shouldRestartRef.current = true;
        }
        return;
      }
      
      if (event.error === 'aborted') {
        // Aborted by us, don't show error
        return;
      }
      
      showToast({ 
        message: `Speech recognition error: ${event.error}`, 
        status: 'error' 
      });
      setIsActive(false);
    };
    
    recognition.onend = () => {
      console.log('[VoiceWorking] Recognition ended', {
        hasStarted,
        hasTranscript: !!finalTranscriptRef.current,
        isActive: isActiveRef.current,
        shouldRestart: shouldRestartRef.current
      });
      
      recognitionRef.current = null;
      setListening(false);
      
      // Submit if we have a transcript
      if (finalTranscriptRef.current.trim()) {
        handleSubmit(finalTranscriptRef.current.trim());
        shouldRestartRef.current = false; // Don't restart after submission
      }
      
      // Restart if still active and not waiting for response
      if (isActiveRef.current && !isWaitingForResponse && (shouldRestartRef.current || !finalTranscriptRef.current)) {
        shouldRestartRef.current = false;
        console.log('[VoiceWorking] Restarting recognition');
        setTimeout(() => {
          if (isActiveRef.current) {
            startRecognition();
          }
        }, 500);
      }
    };
    
    try {
      recognition.start();
      console.log('[VoiceWorking] Called recognition.start()');
    } catch (error) {
      console.error('[VoiceWorking] Failed to start recognition:', error);
      showToast({
        message: 'Failed to start speech recognition',
        status: 'error',
      });
      setIsActive(false);
    }
  }, [setListening, setTranscript, setValue, showToast, handleSubmit, isWaitingForResponse]);
  
  // Start recognition when activated
  useEffect(() => {
    if (isActive && engineSTT === 'browser' && !recognitionRef.current && !isWaitingForResponse) {
      startRecognition();
    }
  }, [isActive, engineSTT, startRecognition, isWaitingForResponse]);
  
  // Monitor for AI responses
  useEffect(() => {
    console.log('[VoiceWorking] Latest message check:', {
      hasMessage: !!latestMessage,
      isUserMessage: latestMessage?.isCreatedByUser,
      messageId: latestMessage?.messageId,
      lastMessageId: lastMessageIdRef.current,
      isActive,
      isWaitingForResponse
    });
    
    if (!latestMessage || latestMessage.isCreatedByUser || !isActive) return;
    
    if (latestMessage.messageId && latestMessage.messageId !== lastMessageIdRef.current) {
      console.log('[VoiceWorking] New AI message detected, will speak');
      lastMessageIdRef.current = latestMessage.messageId;
      setIsWaitingForResponse(false);
      
      if (latestMessage.text && textToSpeech) {
        console.log('[VoiceWorking] Starting TTS');
        generateSpeechLocal(latestMessage.text);
      }
    }
  }, [latestMessage, isActive, textToSpeech, generateSpeechLocal]);
  
  // Resume after speech ends
  useEffect(() => {
    if (!isSpeaking && isActive && !isWaitingForResponse && !recognitionRef.current) {
      console.log('[VoiceWorking] Speech ended, resuming recognition');
      setTimeout(() => {
        if (isActiveRef.current && !recognitionRef.current) {
          startRecognition();
        }
      }, 500);
    }
  }, [isSpeaking, isActive, isWaitingForResponse, startRecognition]);
  
  const handleClick = useCallback(() => {
    if (isActive) {
      console.log('[VoiceWorking] Deactivating');
      setIsActive(false);
      setContinuousMode(false);
      shouldRestartRef.current = false;
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          console.log('[VoiceWorking] Error aborting recognition:', e);
        }
        recognitionRef.current = null;
      }
      
      cancelSpeechLocal();
      setIsWaitingForResponse(false);
    } else {
      console.log('[VoiceWorking] Activating');
      setIsActive(true);
      setContinuousMode(true);
      shouldRestartRef.current = true;
      setIsWaitingForResponse(false);
      
      showToast({
        message: 'Voice mode activated',
        status: 'info',
        duration: 2000,
      });
    }
  }, [isActive, setContinuousMode, cancelSpeechLocal, showToast]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore
        }
      }
      cancelSpeechLocal();
    };
  }, [cancelSpeechLocal]);
  
  if (!speechToTextEnabled || engineSTT !== 'browser') {
    return null;
  }
  
  const getIconColor = () => {
    const color = isSpeaking ? 'text-blue-500' :
                  isWaitingForResponse ? 'text-yellow-500' :
                  isActive ? 'text-green-500' :
                  'text-muted-foreground';
    console.log('[VoiceWorking] Icon color:', color, { isSpeaking, isWaitingForResponse, isActive });
    return color;
  };
  
  return (
    <TooltipAnchor
      description={isActive ? 'Stop voice mode' : 'Start voice mode'}
      render={
        <button
          type="button"
          aria-label={localize('com_ui_voice_input')}
          aria-pressed={isActive}
          onClick={handleClick}
          disabled={disabled || isSubmitting}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors',
            'hover:bg-surface-hover',
            isActive && 'bg-surface-tertiary',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <svg 
            className={cn('h-5 w-5 transition-colors', getIconColor())}
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
            {isActive && (
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
          {isActive && (
            <span className={cn(
              'absolute -top-1 -right-1 h-3 w-3 rounded-full animate-pulse',
              isSpeaking ? 'bg-blue-500' : 
              isWaitingForResponse ? 'bg-yellow-500' : 
              'bg-green-500'
            )} />
          )}
        </button>
      }
    />
  );
}