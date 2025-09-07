import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize, useSubmitMessage } from '~/hooks';
import { useChatFormContext, useChatContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

// Check for browser speech recognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasSpeechRecognition = !!SpeechRecognition;

interface VoiceChatContinuousFinalProps {
  disabled?: boolean;
}

export default function VoiceChatContinuousFinal({ disabled = false }: VoiceChatContinuousFinalProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { submitMessage } = useSubmitMessage();
  const methods = useChatFormContext();
  const { conversation, isSubmitting, latestMessage } = useChatContext();
  
  // Get TTS settings
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const globalAudioPlaying = useRecoilValue(store.globalAudioPlayingFamily(0));
  
  // Simple state - following debug component pattern
  const [isActive, setIsActive] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  
  const recognitionRef = useRef<any>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  
  // Start recognition - EXACT pattern from debug component
  const startRecognition = useCallback(() => {
    if (!hasSpeechRecognition) {
      showToast({
        message: 'Speech recognition not supported in this browser',
        status: 'error',
      });
      return;
    }
    
    console.log('[VoiceContinuousFinal] Starting recognition...');
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let finalTranscript = '';
    let silenceTimer: any = null;
    
    recognition.onstart = () => {
      console.log('[VoiceContinuousFinal] Recognition started');
    };
    
    recognition.onresult = (event: any) => {
      let interim = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interim = event.results[i][0].transcript;
        }
      }
      
      const fullTranscript = finalTranscript + interim;
      console.log('[VoiceContinuousFinal] Transcript:', fullTranscript);
      
      // Clear existing timer
      if (silenceTimer) clearTimeout(silenceTimer);
      
      // Set new timer for submission
      if (finalTranscript.trim()) {
        silenceTimer = setTimeout(() => {
          console.log('[VoiceContinuousFinal] Submitting:', finalTranscript.trim());
          setTurnCount(prev => prev + 1);
          
          // Submit the message
          methods.setValue('text', finalTranscript.trim());
          methods.handleSubmit((data) => {
            submitMessage(data);
          })();
          
          // Stop recognition
          if (recognitionRef.current) {
            recognitionRef.current.abort();
            recognitionRef.current = null;
          }
        }, 1500);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.log('[VoiceContinuousFinal] Error:', event.error);
      if (event.error !== 'aborted') {
        showToast({ message: `Error: ${event.error}`, status: 'error' });
      }
    };
    
    recognition.onend = () => {
      console.log('[VoiceContinuousFinal] Recognition ended');
      recognitionRef.current = null;
    };
    
    recognitionRef.current = recognition;
    
    try {
      recognition.start();
    } catch (error) {
      console.log('[VoiceContinuousFinal] Failed to start:', error);
    }
  }, [methods, submitMessage, showToast]);
  
  // Monitor AI responses - EXACT pattern from debug component
  useEffect(() => {
    if (!latestMessage || !isActive) return;
    
    if (!latestMessage.isCreatedByUser && latestMessage.messageId !== lastMessageIdRef.current) {
      console.log('[VoiceContinuousFinal] AI Response detected:', latestMessage.messageId);
      lastMessageIdRef.current = latestMessage.messageId;
      
      // Try to resume after a delay
      setTimeout(() => {
        console.log('[VoiceContinuousFinal] Attempting to resume recognition...');
        if (isActive && !recognitionRef.current) {
          startRecognition();
        } else {
          console.log('[VoiceContinuousFinal] Cannot resume - active:', isActive, 'recognition:', !!recognitionRef.current);
        }
      }, 1000);
    }
  }, [latestMessage, isActive, startRecognition]);
  
  // Monitor audio playback - EXACT pattern from debug component
  useEffect(() => {
    if (!isActive) return;
    
    console.log('[VoiceContinuousFinal] Audio playing:', globalAudioPlaying);
    
    if (!globalAudioPlaying && !recognitionRef.current) {
      console.log('[VoiceContinuousFinal] Audio stopped, starting recognition');
      setTimeout(() => startRecognition(), 500);
    }
  }, [globalAudioPlaying, isActive, startRecognition]);
  
  // Toggle active state
  const toggle = useCallback(() => {
    if (isActive) {
      console.log('[VoiceContinuousFinal] Deactivating');
      setIsActive(false);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } else {
      console.log('[VoiceContinuousFinal] Activating continuous mode');
      setIsActive(true);
      setTurnCount(0);
      startRecognition();
      
      showToast({
        message: 'Continuous voice mode activated. Speak naturally.',
        status: 'info',
        duration: 3000,
      });
    }
  }, [isActive, startRecognition, showToast]);
  
  // Get icon color based on state
  const getIconColor = () => {
    if (globalAudioPlaying) return 'text-blue-500';
    if (recognitionRef.current) return 'text-green-500';
    return 'text-muted-foreground';
  };
  
  return (
    <TooltipAnchor
      description={isActive ? 'Stop continuous voice (Turn ' + turnCount + ')' : 'Start continuous voice'}
      render={
        <button
          type="button"
          aria-label={localize('com_ui_voice_continuous')}
          aria-pressed={isActive}
          onClick={toggle}
          disabled={disabled || !hasSpeechRecognition || isSubmitting}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors',
            'hover:bg-surface-hover',
            isActive && 'bg-surface-tertiary',
            (disabled || !hasSpeechRecognition) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {/* Sound wave icon with animation */}
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
              globalAudioPlaying ? 'bg-blue-500' : 'bg-green-500'
            )} />
          )}
          {isActive && (
            <span className="absolute -bottom-1 -right-1 text-xs font-bold text-green-500">∞</span>
          )}
        </button>
      }
    />
  );
}