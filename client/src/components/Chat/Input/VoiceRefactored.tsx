import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize, useSubmitMessage } from '~/hooks';
import { useChatFormContext, useChatContext } from '~/Providers';
import useTextToSpeechBrowser from '~/hooks/Input/useTextToSpeechBrowser';
import { cn } from '~/utils';
import { 
  voiceListeningState, 
  voiceTranscriptState,
  voiceContinuousModeState 
} from '~/store/voice';
import store from '~/store';

interface VoiceRefactoredProps {
  disabled?: boolean;
}

export default function VoiceRefactored({ disabled = false }: VoiceRefactoredProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const methods = useChatFormContext();
  const { submitMessage } = useSubmitMessage();
  const { setValue } = methods;
  const { conversation, isSubmitting, latestMessage } = useChatContext();
  
  // Settings
  const speechToTextEnabled = useRecoilValue(store.speechToText);
  const engineSTT = useRecoilValue(store.engineSTT);
  const textToSpeech = useRecoilValue(store.textToSpeech);
  
  // Voice states
  const setListening = useSetRecoilState(voiceListeningState);
  const setTranscript = useSetRecoilState(voiceTranscriptState);
  const setContinuousMode = useSetRecoilState(voiceContinuousModeState);
  
  // Component state
  const [isActive, setIsActive] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Refs for tracking
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const lastMessageIdRef = useRef<string | null>(null);
  const isActiveRef = useRef(false);
  
  // TTS hook
  const { generateSpeechLocal, cancelSpeechLocal } = useTextToSpeechBrowser({ setIsSpeaking });
  
  // Keep ref in sync
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  
  // Handle submission
  const handleSubmit = useCallback((text: string) => {
    console.log('[VoiceRefactored] Submitting:', text);
    
    // Set waiting state first
    setIsWaitingForResponse(true);
    
    // Submit using proper methods
    setValue('text', text);
    submitMessage({ text });
    
    // Clear transcript
    setTranscript({ text: '', isFinal: false });
    finalTranscriptRef.current = '';
  }, [setValue, submitMessage, setTranscript]);
  
  // Start speech recognition
  const startRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      showToast({
        message: 'Speech recognition not supported in your browser',
        status: 'error',
      });
      setIsActive(false);
      return;
    }
    
    console.log('[VoiceRefactored] Starting recognition');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      console.log('[VoiceRefactored] Recognition started');
      setListening(true);
      setTranscript({ text: '🎤 Listening...', isFinal: false });
      finalTranscriptRef.current = '';
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
        const newFinal = finalTranscriptRef.current + final;
        finalTranscriptRef.current = newFinal;
        setTranscript({ text: newFinal + interim, isFinal: false });
        setValue('text', newFinal + interim);
      } else if (interim) {
        setTranscript({ text: finalTranscriptRef.current + interim, isFinal: false });
        setValue('text', finalTranscriptRef.current + interim);
      }
    };
    
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.error('[VoiceRefactored] Recognition error:', event.error);
      showToast({ message: 'Speech recognition error', status: 'error' });
    };
    
    recognition.onend = () => {
      console.log('[VoiceRefactored] Recognition ended');
      setListening(false);
      recognitionRef.current = null;
      
      // Submit if we have text
      if (finalTranscriptRef.current.trim()) {
        handleSubmit(finalTranscriptRef.current.trim());
      }
      
      // Only deactivate in single mode
      if (!isWaitingForResponse && !isActiveRef.current) {
        setIsActive(false);
        setContinuousMode(false);
      }
    };
    
    try {
      recognition.start();
    } catch (error) {
      console.error('[VoiceRefactored] Failed to start:', error);
      showToast({ message: 'Failed to start speech recognition', status: 'error' });
    }
  }, [setListening, setTranscript, setValue, showToast, handleSubmit, setContinuousMode, isWaitingForResponse]);
  
  // Initialize recognition when active
  useEffect(() => {
    if (isActive && engineSTT === 'browser' && !isWaitingForResponse && !isSpeaking) {
      // Small delay to ensure proper state
      const timer = setTimeout(() => {
        if (isActiveRef.current && !recognitionRef.current) {
          startRecognition();
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isActive, engineSTT, isWaitingForResponse, isSpeaking, startRecognition]);
  
  // Monitor for AI responses and speak them
  useEffect(() => {
    if (!isActive || !latestMessage || latestMessage.isCreatedByUser) return;
    
    // Check if this is a new message we haven't spoken
    if (latestMessage.messageId && 
        latestMessage.messageId !== lastMessageIdRef.current &&
        isWaitingForResponse) {
      
      console.log('[VoiceRefactored] New AI message detected');
      lastMessageIdRef.current = latestMessage.messageId;
      setIsWaitingForResponse(false);
      
      // Speak the response if TTS is enabled
      if (latestMessage.text && textToSpeech) {
        console.log('[VoiceRefactored] Speaking AI response');
        generateSpeechLocal(latestMessage.text);
      }
    }
  }, [latestMessage, isActive, isWaitingForResponse, textToSpeech, generateSpeechLocal]);
  
  // Handle click
  const handleClick = useCallback(() => {
    if (isActive) {
      // Stop everything
      console.log('[VoiceRefactored] Deactivating');
      setIsActive(false);
      setContinuousMode(false);
      setIsWaitingForResponse(false);
      
      // Stop recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      
      // Cancel speech
      cancelSpeechLocal();
    } else {
      // Start
      console.log('[VoiceRefactored] Activating');
      setIsActive(true);
      setContinuousMode(true);
      lastMessageIdRef.current = null;
      
      showToast({
        message: 'Voice mode activated - Speak naturally',
        status: 'info',
        duration: 2000,
      });
    }
  }, [isActive, setContinuousMode, showToast, cancelSpeechLocal]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore
        }
        recognitionRef.current = null;
      }
      cancelSpeechLocal();
    };
  }, [cancelSpeechLocal]);
  
  // Don't render if STT not enabled or not browser mode
  if (!speechToTextEnabled || engineSTT !== 'browser') {
    return null;
  }
  
  // Determine icon color based on state
  const getIconColor = () => {
    if (isSpeaking) return 'text-blue-500'; // AI is speaking
    if (isWaitingForResponse) return 'text-yellow-500'; // Waiting for AI
    if (isActive) return 'text-green-500'; // Active and listening
    return 'text-muted-foreground'; // Inactive
  };
  
  return (
    <TooltipAnchor
      description={isActive ? 'Stop voice conversation' : 'Start voice conversation'}
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
          {/* Sound wave icon as requested */}
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