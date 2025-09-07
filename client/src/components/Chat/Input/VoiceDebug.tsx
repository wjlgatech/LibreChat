import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize, useSubmitMessage } from '~/hooks';
import { useChatFormContext, useChatContext } from '~/Providers';
import { cn } from '~/utils';
import { 
  voiceListeningState, 
  voiceTranscriptState,
  voiceContinuousModeState 
} from '~/store/voice';
import store from '~/store';

interface VoiceDebugProps {
  disabled?: boolean;
}

export default function VoiceDebug({ disabled = false }: VoiceDebugProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { submitMessage } = useSubmitMessage();
  const methods = useChatFormContext();
  const { isSubmitting } = useChatContext();
  
  // Check if STT is enabled and the engine type
  const speechToTextEnabled = useRecoilValue(store.speechToText);
  const engineSTT = useRecoilValue(store.engineSTT);
  
  // Voice states
  const setListening = useSetRecoilState(voiceListeningState);
  const setTranscript = useSetRecoilState(voiceTranscriptState);
  const setContinuousMode = useSetRecoilState(voiceContinuousModeState);
  
  const [isActive, setIsActive] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  // Web Speech API
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  
  const addDebug = (msg: string) => {
    console.log(`[VoiceDebug] ${msg}`);
    setDebugInfo(prev => [...prev.slice(-9), msg]);
  };
  
  const handleSubmit = useCallback((text: string) => {
    addDebug(`Submitting: "${text}"`);
    
    methods.setValue('text', text);
    methods.handleSubmit((data) => {
      addDebug('Form submitted');
      submitMessage(data);
    })();
    
    setTranscript({ text: '', isFinal: false });
    finalTranscriptRef.current = '';
  }, [methods, submitMessage, setTranscript]);
  
  const startListening = useCallback(() => {
    addDebug('startListening called');
    
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      addDebug('ERROR: Speech recognition not supported');
      return;
    }
    
    if (recognitionRef.current) {
      addDebug('Stopping existing recognition');
      try {
        recognitionRef.current.abort();
      } catch (e) {
        addDebug('Error aborting: ' + e);
      }
      recognitionRef.current = null;
    }
    
    addDebug('Creating new recognition');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      addDebug('Recognition started');
      setListening(true);
      setTranscript({ text: '🎤 Listening...', isFinal: false });
    };
    
    recognition.onresult = (event: any) => {
      addDebug(`Result: ${event.results.length} results`);
      let interimTranscript = '';
      let finalTranscript = finalTranscriptRef.current;
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          addDebug(`Final: "${transcript}"`);
        } else {
          interimTranscript += transcript;
        }
      }
      
      finalTranscriptRef.current = finalTranscript;
      const fullTranscript = finalTranscript + interimTranscript;
      setTranscript({ text: fullTranscript || '🎤 Listening...', isFinal: false });
      methods.setValue('text', fullTranscript);
    };
    
    recognition.onerror = (event: any) => {
      addDebug(`ERROR: ${event.error}`);
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      showToast({ message: `Speech error: ${event.error}`, status: 'error' });
    };
    
    recognition.onend = () => {
      addDebug('Recognition ended');
      setListening(false);
      
      if (finalTranscriptRef.current.trim()) {
        addDebug('Submitting final transcript');
        handleSubmit(finalTranscriptRef.current.trim());
      } else {
        addDebug('No transcript to submit');
      }
      
      recognitionRef.current = null;
      setIsActive(false);
      setContinuousMode(false);
    };
    
    try {
      recognition.start();
      addDebug('Called recognition.start()');
    } catch (error: any) {
      addDebug('ERROR starting: ' + error.message);
      showToast({
        message: 'Failed to start speech recognition',
        status: 'error',
      });
    }
  }, [setListening, setTranscript, showToast, handleSubmit, methods, setContinuousMode]);
  
  const handleClick = useCallback(() => {
    addDebug(`Click: isActive=${isActive}, engine=${engineSTT}`);
    
    if (isActive) {
      addDebug('Stopping');
      setIsActive(false);
      setContinuousMode(false);
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          addDebug('Called recognition.stop()');
        } catch (e) {
          addDebug('Error stopping: ' + e);
        }
      }
    } else {
      addDebug('Starting');
      setIsActive(true);
      setContinuousMode(true);
      finalTranscriptRef.current = '';
      
      if (engineSTT === 'browser') {
        startListening();
      } else {
        addDebug('External STT not implemented in debug mode');
        showToast({
          message: 'Debug mode only supports browser STT',
          status: 'warning',
        });
      }
    }
  }, [isActive, engineSTT, setContinuousMode, startListening, showToast]);
  
  useEffect(() => {
    addDebug(`Component mounted: STT=${speechToTextEnabled}, engine=${engineSTT}`);
    return () => {
      addDebug('Component unmounting');
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);
  
  return (
    <div className="relative">
      <TooltipAnchor
        description={isActive ? 'Stop voice debug' : 'Start voice debug'}
        render={
          <button
            type="button"
            aria-label="Voice Debug"
            aria-pressed={isActive}
            onClick={handleClick}
            disabled={disabled || isSubmitting || !speechToTextEnabled || engineSTT !== 'browser'}
            className={cn(
              'flex size-9 items-center justify-center rounded-full p-1 transition-colors',
              'hover:bg-surface-hover',
              isActive && 'bg-surface-tertiary',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <svg 
              className={cn('h-5 w-5 transition-colors', isActive ? 'text-red-500' : 'text-muted-foreground')}
              fill="none" 
              viewBox="0 0 24 24" 
              strokeWidth="2"
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </button>
        }
      />
      
      {/* Debug panel */}
      <div className="absolute bottom-full right-0 mb-2 w-64 max-h-48 overflow-y-auto bg-surface-primary border border-border rounded-lg shadow-lg p-2 text-xs font-mono">
        <div className="font-bold mb-1">Debug Log:</div>
        {debugInfo.map((line, i) => (
          <div key={i} className={cn(
            'py-0.5',
            line.includes('ERROR') && 'text-red-500',
            line.includes('started') && 'text-green-500'
          )}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}