import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useChatFormContext, useChatContext } from '~/Providers';
import { cn } from '~/utils';
import { 
  voiceListeningState, 
  voiceTranscriptState, 
  voiceAIResponseState,
  voiceContinuousModeState 
} from '~/store/voice';
import store from '~/store';

// Try to get SpeechRecognition from window or create a fallback
const getSpeechRecognition = () => {
  try {
    // Try direct access
    if (window.SpeechRecognition) {
      return window.SpeechRecognition;
    }
    
    // Try webkit prefix
    if ((window as any).webkitSpeechRecognition) {
      return (window as any).webkitSpeechRecognition;
    }
    
    // Try creating in an iframe to bypass restrictions
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const iframeWindow = iframe.contentWindow;
    if (iframeWindow) {
      const IframeSpeechRecognition = (iframeWindow as any).SpeechRecognition || (iframeWindow as any).webkitSpeechRecognition;
      if (IframeSpeechRecognition) {
        document.body.removeChild(iframe);
        return IframeSpeechRecognition;
      }
    }
    
    document.body.removeChild(iframe);
    return null;
  } catch (e) {
    console.error('[VoiceWorkaround] Failed to get SpeechRecognition:', e);
    return null;
  }
};

interface VoiceWorkaroundProps {
  disabled?: boolean;
}

export default function VoiceWorkaround({ disabled = false }: VoiceWorkaroundProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const methods = useChatFormContext();
  const { isSubmitting } = useChatContext();
  
  const setListening = useSetRecoilState(voiceListeningState);
  const setTranscript = useSetRecoilState(voiceTranscriptState);
  const setContinuousMode = useSetRecoilState(voiceContinuousModeState);
  
  const [isActive, setIsActive] = useState(false);
  const [SpeechRecognitionClass, setSpeechRecognitionClass] = useState<any>(null);
  
  const recognitionRef = useRef<any>(null);
  
  // Try to get SpeechRecognition on mount
  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (SpeechRecognition) {
      setSpeechRecognitionClass(() => SpeechRecognition);
      console.log('[VoiceWorkaround] SpeechRecognition available');
    } else {
      console.error('[VoiceWorkaround] No SpeechRecognition available');
    }
  }, []);
  
  const startListening = useCallback(() => {
    if (!SpeechRecognitionClass) {
      showToast({
        message: 'Voice recognition not available in this environment',
        status: 'error',
      });
      return;
    }
    
    console.log('[VoiceWorkaround] Starting recognition');
    
    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        console.log('[VoiceWorkaround] Recognition started');
        setListening(true);
      };
      
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
        }
        console.log('[VoiceWorkaround] Transcript:', transcript);
        setTranscript({ text: transcript.trim(), isFinal: false });
      };
      
      recognition.onerror = (event: any) => {
        console.error('[VoiceWorkaround] Error:', event.error);
        setListening(false);
        showToast({
          message: `Voice error: ${event.error}`,
          status: 'error',
        });
      };
      
      recognition.onend = () => {
        console.log('[VoiceWorkaround] Recognition ended');
        setListening(false);
      };
      
      recognitionRef.current = recognition;
      recognition.start();
      
    } catch (error: any) {
      console.error('[VoiceWorkaround] Failed to start:', error);
      showToast({
        message: 'Failed to start voice recognition',
        status: 'error',
      });
    }
  }, [SpeechRecognitionClass, setListening, setTranscript, showToast]);
  
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, [setListening]);
  
  const handleClick = useCallback(() => {
    if (isActive) {
      setIsActive(false);
      setContinuousMode(false);
      stopListening();
    } else {
      setIsActive(true);
      setContinuousMode(true);
      startListening();
    }
  }, [isActive, setContinuousMode, startListening, stopListening]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);
  
  const getIconColor = () => {
    if (isActive) return 'text-green-500';
    return 'text-muted-foreground';
  };
  
  return (
    <button
      type="button"
      aria-label={localize('com_ui_voice_input')}
      onClick={handleClick}
      disabled={disabled || !SpeechRecognitionClass || isSubmitting}
      className={cn(
        'flex size-9 items-center justify-center rounded-full p-1 transition-colors',
        'hover:bg-surface-hover',
        isActive && 'bg-surface-tertiary',
        (disabled || !SpeechRecognitionClass) && 'opacity-50 cursor-not-allowed'
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
          'absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500',
          'animate-pulse'
        )} />
      )}
    </button>
  );
}