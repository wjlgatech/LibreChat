import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { cn } from '~/utils';
import { 
  voiceListeningState, 
  voiceTranscriptState,
  voiceContinuousModeState 
} from '~/store/voice';
import store from '~/store';

interface VoiceSimpleProps {
  disabled?: boolean;
}

export default function VoiceSimple({ disabled = false }: VoiceSimpleProps) {
  const localize = useLocalize();
  const methods = useChatFormContext();
  const { handleSubmit, setValue } = methods;
  
  // Check if STT is enabled and the engine type
  const speechToTextEnabled = useRecoilValue(store.speechToText);
  const engineSTT = useRecoilValue(store.engineSTT);
  
  // Voice states
  const setListening = useSetRecoilState(voiceListeningState);
  const setTranscript = useSetRecoilState(voiceTranscriptState);
  const setContinuousMode = useSetRecoilState(voiceContinuousModeState);
  
  const [isActive, setIsActive] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  
  // Web Speech API
  const recognitionRef = useRef<any>(null);
  
  // Initialize speech recognition
  useEffect(() => {
    if (!isActive || engineSTT !== 'browser') return;
    
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.error('[VoiceSimple] Speech recognition not supported');
      return;
    }
    
    console.log('[VoiceSimple] Initializing speech recognition');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      console.log('[VoiceSimple] Recognition started');
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
        console.log('[VoiceSimple] Final:', final);
      } else if (interim) {
        setTranscript({ text: finalTranscript + interim, isFinal: false });
        setValue('text', finalTranscript + interim);
      }
    };
    
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return; // Ignore these in continuous mode
      }
      console.error('[VoiceSimple] Recognition error:', event.error);
    };
    
    recognition.onend = () => {
      console.log('[VoiceSimple] Recognition ended');
      setListening(false);
      
      // Submit if we have text
      if (finalTranscript.trim()) {
        console.log('[VoiceSimple] Submitting:', finalTranscript);
        setValue('text', finalTranscript.trim());
        handleSubmit({ text: finalTranscript.trim() });
        setFinalTranscript('');
      }
      
      setIsActive(false);
      setContinuousMode(false);
    };
    
    try {
      recognition.start();
    } catch (error) {
      console.error('[VoiceSimple] Failed to start:', error);
    }
    
    // Cleanup
    return () => {
      console.log('[VoiceSimple] Cleaning up recognition');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [isActive, engineSTT, finalTranscript, setValue, handleSubmit, setListening, setTranscript, setContinuousMode]);
  
  const handleClick = useCallback(() => {
    if (isActive) {
      // Stop
      console.log('[VoiceSimple] Stopping');
      setIsActive(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      // Start
      console.log('[VoiceSimple] Starting');
      setIsActive(true);
      setContinuousMode(true);
      setFinalTranscript('');
    }
  }, [isActive, setContinuousMode]);
  
  if (!speechToTextEnabled || engineSTT !== 'browser') {
    return null; // Don't render if not using browser STT
  }
  
  return (
    <TooltipAnchor
      description={isActive ? 'Stop voice input' : 'Start voice input'}
      render={
        <button
          type="button"
          aria-label={localize('com_ui_voice_input')}
          aria-pressed={isActive}
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors',
            'hover:bg-surface-hover',
            isActive && 'bg-surface-tertiary',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <svg 
            className={cn('h-5 w-5 transition-colors', isActive ? 'text-green-500' : 'text-muted-foreground')}
            fill="none" 
            viewBox="0 0 24 24" 
            strokeWidth="2"
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
          {isActive && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 animate-pulse" />
          )}
        </button>
      }
    />
  );
}