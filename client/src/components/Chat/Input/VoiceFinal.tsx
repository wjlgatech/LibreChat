import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { TooltipAnchor } from '@librechat/client';
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

interface VoiceFinalProps {
  disabled?: boolean;
  ask: (data: { text: string }) => void;
  methods: any;
}

export default function VoiceFinal({ disabled = false, ask, methods }: VoiceFinalProps) {
  const localize = useLocalize();
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
  const [finalTranscript, setFinalTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  
  // TTS
  const { generateSpeechLocal, cancelSpeechLocal } = useTextToSpeechBrowser({ setIsSpeaking });
  
  // Web Speech API
  const recognitionRef = useRef<any>(null);
  
  // Initialize speech recognition when active
  useEffect(() => {
    if (!isActive || engineSTT !== 'browser') return;
    
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.error('[VoiceFinal] Speech recognition not supported');
      setIsActive(false);
      return;
    }
    
    console.log('[VoiceFinal] Initializing speech recognition');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      console.log('[VoiceFinal] Recognition started');
      setListening(true);
      setTranscript({ text: '🎤 Listening...', isFinal: false });
    };
    
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      
      if (final) {
        const newFinal = finalTranscript + final;
        setFinalTranscript(newFinal);
        setTranscript({ text: newFinal + interim, isFinal: false });
        setValue('text', newFinal + interim);
      } else if (interim) {
        setTranscript({ text: finalTranscript + interim, isFinal: false });
        setValue('text', finalTranscript + interim);
      }
    };
    
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.error('[VoiceFinal] Recognition error:', event.error);
    };
    
    recognition.onend = () => {
      console.log('[VoiceFinal] Recognition ended');
      setListening(false);
      
      // Submit if we have text
      if (finalTranscript.trim()) {
        console.log('[VoiceFinal] Submitting:', finalTranscript);
        ask({ text: finalTranscript.trim() });
        reset({ text: '' });
        setFinalTranscript('');
      }
      
      setIsActive(false);
      setContinuousMode(false);
    };
    
    try {
      recognition.start();
    } catch (error) {
      console.error('[VoiceFinal] Failed to start:', error);
      setIsActive(false);
    }
    
    // Cleanup
    return () => {
      console.log('[VoiceFinal] Cleaning up');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [isActive, engineSTT, finalTranscript, setValue, ask, reset, setListening, setTranscript, setContinuousMode]);
  
  // Monitor for AI responses and speak them
  useEffect(() => {
    if (!textToSpeech || !latestMessage || latestMessage.isCreatedByUser) return;
    
    if (latestMessage.messageId && latestMessage.messageId !== lastMessageId && latestMessage.text) {
      console.log('[VoiceFinal] New AI message, speaking it');
      setLastMessageId(latestMessage.messageId);
      generateSpeechLocal(latestMessage.text);
    }
  }, [latestMessage, lastMessageId, textToSpeech, generateSpeechLocal]);
  
  const handleClick = useCallback(() => {
    if (isActive) {
      console.log('[VoiceFinal] Stopping');
      setIsActive(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      cancelSpeechLocal();
    } else {
      console.log('[VoiceFinal] Starting');
      setIsActive(true);
      setContinuousMode(true);
      setFinalTranscript('');
    }
  }, [isActive, setContinuousMode, cancelSpeechLocal]);
  
  if (!speechToTextEnabled || engineSTT !== 'browser') {
    return null;
  }
  
  return (
    <TooltipAnchor
      description={isActive ? 'Stop voice input' : 'Start voice input (works like VoiceSimple)'}
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
            className={cn('h-5 w-5 transition-colors', 
              isSpeaking ? 'text-blue-500' : 
              isActive ? 'text-green-500' : 
              'text-muted-foreground'
            )}
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
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 animate-pulse" />
          )}
        </button>
      }
    />
  );
}