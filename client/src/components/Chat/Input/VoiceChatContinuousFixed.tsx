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

interface VoiceChatContinuousFixedProps {
  disabled?: boolean;
}

export default function VoiceChatContinuousFixed({ disabled = false }: VoiceChatContinuousFixedProps) {
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
  const isWaitingForResponseRef = useRef(false);
  const establishedConversationRef = useRef<boolean>(false);
  const messageCountRef = useRef<number>(0);
  
  // Keep refs in sync - IMPORTANT: Include isWaitingForResponseRef
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  
  useEffect(() => {
    isWaitingForResponseRef.current = isWaitingForResponse;
  }, [isWaitingForResponse]);
  
  // Track when conversation is established
  useEffect(() => {
    const currentMessages = getMessages();
    const messageCount = currentMessages?.length || 0;
    
    if (messageCount > 0 && conversation?.conversationId && conversation.conversationId !== 'new') {
      if (!establishedConversationRef.current) {
        console.log('[VoiceContinuousFixed] Conversation established with ID:', conversation.conversationId);
        establishedConversationRef.current = true;
      }
    }
    
    if (messageCount !== messageCountRef.current) {
      console.log('[VoiceContinuousFixed] Message count changed:', messageCountRef.current, '->', messageCount);
      messageCountRef.current = messageCount;
    }
  }, [conversation?.conversationId, getMessages]);
  
  // Stop listening function
  const stopListening = useCallback(() => {
    console.log('[VoiceContinuousFixed] Stopping listening');
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.error('[VoiceContinuousFixed] Error stopping recognition:', e);
      }
      recognitionRef.current = null;
    }
    
    setIsListening(false);
  }, []);
  
  // Handle submission
  const handleSubmit = useCallback((text: string) => {
    console.log('[VoiceContinuousFixed] Submitting:', text);
    
    // Set waiting state before submission
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
  
  // Start listening function - REMOVED problematic dependencies
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
      console.log('[VoiceContinuousFixed] Cleaning up existing recognition');
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    
    console.log('[VoiceContinuousFixed] Starting recognition, isWaitingForResponse:', isWaitingForResponseRef.current);
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let accumulatedTranscript = '';
    
    recognition.onstart = () => {
      console.log('[VoiceContinuousFixed] Recognition started successfully');
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
      console.log('[VoiceContinuousFixed] Transcript update:', displayTranscript);
      
      if (displayTranscript.trim()) {
        setTranscript(displayTranscript.trim());
        
        // Reset silence timer
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        
        // Submit after 1.5 seconds of silence - use ref to get current state
        silenceTimeoutRef.current = setTimeout(() => {
          if (accumulatedTranscript.trim() && !globalAudioPlaying && !isWaitingForResponseRef.current) {
            console.log('[VoiceContinuousFixed] Submitting after silence');
            handleSubmit(accumulatedTranscript.trim());
          } else {
            console.log('[VoiceContinuousFixed] Not submitting - waiting:', isWaitingForResponseRef.current, 'audio:', globalAudioPlaying);
          }
        }, 1500);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[VoiceContinuousFixed] Recognition error:', event.error);
      setIsListening(false);
      
      if (event.error === 'no-speech' && isActiveRef.current && !isWaitingForResponseRef.current) {
        // Restart on no-speech error
        setTimeout(() => {
          if (isActiveRef.current && !isWaitingForResponseRef.current) {
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
      console.log('[VoiceContinuousFixed] Recognition ended, isActive:', isActiveRef.current, 'isWaiting:', isWaitingForResponseRef.current);
      setIsListening(false);
      recognitionRef.current = null;
      
      // Restart if still active and not waiting for response - use refs
      if (isActiveRef.current && !isWaitingForResponseRef.current) {
        setTimeout(() => {
          if (isActiveRef.current && !isWaitingForResponseRef.current) {
            console.log('[VoiceContinuousFixed] Restarting recognition after end');
            startListening();
          }
        }, 1000);
      }
    };
    
    recognitionRef.current = recognition;
    
    try {
      recognition.start();
      console.log('[VoiceContinuousFixed] Recognition.start() called');
    } catch (error) {
      console.error('[VoiceContinuousFixed] Failed to start recognition:', error);
      setIsListening(false);
    }
  }, [showToast, globalAudioPlaying, handleSubmit]); // Removed isWaitingForResponse dependency
  
  // Monitor for audio playback
  useEffect(() => {
    if (!isActive) return;
    
    if (globalAudioPlaying && recognitionRef.current) {
      console.log('[VoiceContinuousFixed] Audio playing - stopping recognition');
      stopListening();
    } else if (!globalAudioPlaying && isActive && !isWaitingForResponse && !recognitionRef.current) {
      console.log('[VoiceContinuousFixed] Audio stopped - resuming recognition');
      // Add a delay to ensure audio has fully stopped
      setTimeout(() => {
        if (isActiveRef.current && !isWaitingForResponseRef.current && !recognitionRef.current) {
          startListening();
        }
      }, 500);
    }
  }, [globalAudioPlaying, isActive, isWaitingForResponse, startListening, stopListening]);
  
  // Monitor for AI responses - FIXED to always resume after response
  useEffect(() => {
    if (!isActive || !latestMessage) return;
    
    // Check if this is a new AI response
    if (!latestMessage.isCreatedByUser && latestMessage.messageId !== lastMessageIdRef.current) {
      console.log('[VoiceContinuousFixed] New AI response detected, setting isWaitingForResponse to false');
      lastMessageIdRef.current = latestMessage.messageId;
      setIsWaitingForResponse(false);
      
      // Always try to resume after AI response if no audio is playing
      // Don't check TTS settings - let globalAudioPlaying handle it
      if (!globalAudioPlaying && !recognitionRef.current) {
        console.log('[VoiceContinuousFixed] No audio playing, resuming recognition after AI response');
        setTimeout(() => {
          if (isActiveRef.current && !isWaitingForResponseRef.current && !recognitionRef.current) {
            startListening();
          }
        }, 1000);
      } else {
        console.log('[VoiceContinuousFixed] Audio is playing or recognition exists, will resume when audio stops');
      }
    }
  }, [latestMessage, isActive, globalAudioPlaying, startListening]);
  
  // Start/stop listening based on active state and conditions
  useEffect(() => {
    console.log('[VoiceContinuousFixed] State check - active:', isActive, 'waiting:', isWaitingForResponse, 'audio:', globalAudioPlaying, 'recognition:', !!recognitionRef.current);
    
    if (isActive && !isWaitingForResponse && !globalAudioPlaying && !recognitionRef.current) {
      console.log('[VoiceContinuousFixed] Conditions met, starting listening');
      // Small delay to ensure state is settled
      setTimeout(() => {
        if (isActiveRef.current && !isWaitingForResponseRef.current && !globalAudioPlaying && !recognitionRef.current) {
          startListening();
        }
      }, 100);
    } else if (!isActive) {
      stopListening();
    }
  }, [isActive, isWaitingForResponse, globalAudioPlaying, startListening, stopListening]);
  
  // Toggle continuous mode
  const toggleContinuousMode = useCallback(() => {
    if (isActive) {
      console.log('[VoiceContinuousFixed] Deactivating continuous mode');
      setIsActive(false);
      setIsWaitingForResponse(false);
      stopListening();
      
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } else {
      console.log('[VoiceContinuousFixed] Activating continuous mode');
      setIsActive(true);
      setIsWaitingForResponse(false);
      lastMessageIdRef.current = null;
      
      showToast({
        message: 'Continuous voice mode activated. Speak naturally and I\'ll respond when you pause.',
        status: 'info',
        duration: 3000,
      });
      
      // Start recognition immediately
      setTimeout(() => {
        startListening();
      }, 100);
    }
  }, [isActive, showToast, stopListening, startListening]);
  
  // Monitor speech synthesis
  useEffect(() => {
    if (!isActive || !window.speechSynthesis) return;
    
    const checkSpeaking = () => {
      const speaking = window.speechSynthesis.speaking;
      if (speaking !== isSpeaking) {
        console.log('[VoiceContinuousFixed] Speech synthesis state changed:', speaking);
        setIsSpeaking(speaking);
      }
    };
    
    checkSpeaking();
    const interval = setInterval(checkSpeaking, 100);
    
    return () => clearInterval(interval);
  }, [isActive, isSpeaking]);
  
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
            <>
              <span className={cn(
                'absolute -top-1 -right-1 h-3 w-3 rounded-full animate-pulse',
                (globalAudioPlaying || isSpeaking) ? 'bg-blue-500' : 
                isWaitingForResponse ? 'bg-yellow-500' : 
                'bg-green-500'
              )} />
              {/* Show transcript in tooltip when active */}
              {transcript && (
                <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap max-w-[200px] truncate">
                  {transcript}
                </span>
              )}
            </>
          )}
          {isActive && (
            <span className="absolute -bottom-1 -right-1 text-xs font-bold text-green-500">∞</span>
          )}
        </button>
      }
    />
  );
}