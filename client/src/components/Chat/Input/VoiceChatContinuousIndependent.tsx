import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize, useSubmitMessage } from '~/hooks';
import { useChatFormContext, useChatContext } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
import { cn } from '~/utils';
import store from '~/store';

// Check for browser speech recognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasSpeechRecognition = !!SpeechRecognition;

interface VoiceChatContinuousIndependentProps {
  disabled?: boolean;
}

export default function VoiceChatContinuousIndependent({ disabled = false }: VoiceChatContinuousIndependentProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { submitMessage } = useSubmitMessage();
  const methods = useChatFormContext();
  const { conversation, isSubmitting, getMessages, latestMessage } = useChatContext();
  
  // Get messages for the current conversation
  const { data: messages = [] } = useGetMessagesByConvoId(conversation?.conversationId ?? '');
  
  // Get TTS settings
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const globalAudioPlaying = useRecoilValue(store.globalAudioPlayingFamily(0));
  
  // Local state - completely independent from other voice components
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const isActiveRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const audioCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const establishedConversationRef = useRef<boolean>(false);
  const messageCountRef = useRef<number>(0);
  
  // Keep refs in sync
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);
  
  // Track when conversation is established
  useEffect(() => {
    const currentMessages = getMessages();
    const messageCount = currentMessages?.length || 0;
    
    // If we have messages and a real conversation ID, mark as established
    if (messageCount > 0 && conversation?.conversationId && conversation.conversationId !== 'new') {
      if (!establishedConversationRef.current) {
        console.log('[VoiceContinuousIndependent] Conversation established with ID:', conversation.conversationId);
        establishedConversationRef.current = true;
      }
    }
    
    // Update message count
    if (messageCount !== messageCountRef.current) {
      console.log('[VoiceContinuousIndependent] Message count changed:', messageCountRef.current, '->', messageCount);
      messageCountRef.current = messageCount;
    }
  }, [conversation?.conversationId, getMessages]);
  
  // Stop listening function
  const stopListening = useCallback(() => {
    console.log('[VoiceContinuousIndependent] Stopping listening');
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.error('[VoiceContinuousIndependent] Error stopping recognition:', e);
      }
      recognitionRef.current = null;
    }
    
    setIsListening(false);
  }, []);
  
  // Handle submission
  const handleSubmit = useCallback((text: string) => {
    console.log('[VoiceContinuousIndependent] Submitting:', text);
    
    if (!establishedConversationRef.current) {
      console.log('[VoiceContinuousIndependent] First submission - conversation will be established');
    }
    
    // Clear the form and set to waiting state
    setIsWaitingForResponse(true);
    setTranscript('');
    
    // Use the standard form submission
    methods.setValue('text', text);
    methods.handleSubmit((data) => {
      submitMessage(data);
    })();
    
    // Stop listening while waiting for response
    stopListening();
  }, [methods, submitMessage, stopListening]);
  
  // Start listening function
  const startListening = useCallback(() => {
    if (!hasSpeechRecognition) {
      showToast({
        message: 'Speech recognition not supported in this browser. Please use Chrome or Edge.',
        status: 'error',
      });
      return;
    }
    
    // Clean up any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    
    console.log('[VoiceContinuousIndependent] Starting recognition');
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let accumulatedTranscript = '';
    
    recognition.onstart = () => {
      console.log('[VoiceContinuousIndependent] Recognition started');
      setIsListening(true);
      accumulatedTranscript = '';
    };
    
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let currentFinalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          currentFinalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      
      if (currentFinalTranscript) {
        accumulatedTranscript += currentFinalTranscript;
      }
      
      const displayTranscript = accumulatedTranscript + interimTranscript;
      console.log('[VoiceContinuousIndependent] Transcript:', displayTranscript);
      
      if (displayTranscript.trim()) {
        setTranscript(displayTranscript.trim());
        
        // Reset silence timer
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        
        // Submit after 1.5 seconds of silence
        silenceTimeoutRef.current = setTimeout(() => {
          if (accumulatedTranscript.trim() && !globalAudioPlaying && !isWaitingForResponse) {
            console.log('[VoiceContinuousIndependent] Submitting after silence');
            handleSubmit(accumulatedTranscript.trim());
          }
        }, 1500);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[VoiceContinuousIndependent] Recognition error:', event.error);
      setIsListening(false);
      
      if (event.error === 'no-speech' && isActiveRef.current && !isWaitingForResponse) {
        // Restart on no-speech error
        setTimeout(() => {
          if (isActiveRef.current && !isWaitingForResponse) {
            startListening();
          }
        }, 1000);
      } else if (event.error !== 'aborted') {
        showToast({
          message: `Voice recognition error: ${event.error}`,
          status: 'error',
        });
      }
    };
    
    recognition.onend = () => {
      console.log('[VoiceContinuousIndependent] Recognition ended');
      setIsListening(false);
      recognitionRef.current = null;
      
      // Restart if still active and not waiting for response
      if (isActiveRef.current && !isWaitingForResponse) {
        setTimeout(() => {
          if (isActiveRef.current && !isWaitingForResponse) {
            console.log('[VoiceContinuousIndependent] Restarting recognition');
            startListening();
          }
        }, 1000);
      }
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  }, [showToast, globalAudioPlaying, isWaitingForResponse, handleSubmit]);
  
  // Monitor for audio playback
  useEffect(() => {
    if (!isActive) return;
    
    if (globalAudioPlaying && recognitionRef.current) {
      console.log('[VoiceContinuousIndependent] Audio playing - stopping recognition');
      stopListening();
    } else if (!globalAudioPlaying && isActive && !isWaitingForResponse && !recognitionRef.current) {
      console.log('[VoiceContinuousIndependent] Audio stopped - resuming recognition');
      startListening();
    }
  }, [globalAudioPlaying, isActive, isWaitingForResponse, startListening, stopListening]);
  
  // Monitor for AI responses
  useEffect(() => {
    if (!isActive || !latestMessage) return;
    
    // Check if this is a new AI response
    if (!latestMessage.isCreatedByUser && latestMessage.messageId !== lastMessageIdRef.current) {
      console.log('[VoiceContinuousIndependent] New AI response detected');
      lastMessageIdRef.current = latestMessage.messageId;
      setIsWaitingForResponse(false);
      
      // If TTS is enabled, the globalAudioPlaying will handle pausing/resuming
      // Otherwise, resume listening immediately
      if (!textToSpeech || !automaticPlayback) {
        if (isActiveRef.current && !recognitionRef.current) {
          setTimeout(() => startListening(), 500);
        }
      }
    }
  }, [latestMessage, isActive, textToSpeech, automaticPlayback, startListening]);
  
  // Speech synthesis monitoring
  useEffect(() => {
    if (!isActive || !window.speechSynthesis) return;
    
    const checkSpeaking = () => {
      const speaking = window.speechSynthesis.speaking;
      if (speaking !== isSpeakingRef.current) {
        console.log('[VoiceContinuousIndependent] Speech synthesis state changed:', speaking);
        setIsSpeaking(speaking);
      }
    };
    
    // Check initially
    checkSpeaking();
    
    // Set up interval to monitor speech synthesis
    const interval = setInterval(checkSpeaking, 100);
    
    return () => clearInterval(interval);
  }, [isActive]);
  
  // Start/stop listening based on active state
  useEffect(() => {
    if (isActive && !isWaitingForResponse && !globalAudioPlaying && !recognitionRef.current) {
      startListening();
    } else if (!isActive) {
      stopListening();
    }
  }, [isActive, isWaitingForResponse, globalAudioPlaying, startListening, stopListening]);
  
  // Toggle continuous mode
  const toggleContinuousMode = useCallback(() => {
    if (isActive) {
      console.log('[VoiceContinuousIndependent] Deactivating continuous mode');
      setIsActive(false);
      setIsWaitingForResponse(false);
      stopListening();
      
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } else {
      console.log('[VoiceContinuousIndependent] Activating continuous mode');
      setIsActive(true);
      lastMessageIdRef.current = null;
      
      showToast({
        message: 'Continuous voice mode activated. Speak naturally and I\'ll respond when you pause.',
        status: 'info',
        duration: 3000,
      });
    }
  }, [isActive, showToast, stopListening]);
  
  // Get icon color based on state
  const getIconColor = () => {
    if (globalAudioPlaying || isSpeaking) return 'text-blue-500';
    if (isWaitingForResponse) return 'text-yellow-500';
    if (isListening) return 'text-green-500';
    return 'text-muted-foreground';
  };
  
  const getTooltipText = () => {
    if (!hasSpeechRecognition) return 'Voice input not supported in this browser';
    if (isActive) return 'Stop continuous voice mode';
    return 'Start continuous voice conversation';
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (audioCheckIntervalRef.current) {
        clearInterval(audioCheckIntervalRef.current);
      }
    };
  }, []);
  
  return (
    <TooltipAnchor
      description={getTooltipText()}
      render={
        <button
          type="button"
          aria-label={localize('com_ui_voice_continuous')}
          aria-pressed={isActive}
          onClick={toggleContinuousMode}
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
              (globalAudioPlaying || isSpeaking) ? 'bg-blue-500' : 
              isWaitingForResponse ? 'bg-yellow-500' : 
              'bg-green-500'
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