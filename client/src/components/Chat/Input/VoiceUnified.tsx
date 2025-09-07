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
  voiceAIResponseState,
  voiceContinuousModeState 
} from '~/store/voice';
import store from '~/store';

// Check for browser speech recognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasSpeechRecognition = !!SpeechRecognition;

interface VoiceUnifiedProps {
  disabled?: boolean;
}

export default function VoiceUnified({ disabled = false }: VoiceUnifiedProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { submitMessage } = useSubmitMessage();
  const methods = useChatFormContext();
  const { conversation, isSubmitting, latestMessage, getMessages } = useChatContext();
  
  // Get TTS settings
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const globalAudioPlaying = useRecoilValue(store.globalAudioPlayingFamily(0));
  
  // Voice states
  const setListening = useSetRecoilState(voiceListeningState);
  const setTranscript = useSetRecoilState(voiceTranscriptState);
  const setContinuousMode = useSetRecoilState(voiceContinuousModeState);
  
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'single' | 'continuous'>('single');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Initialize TTS hook
  const { generateSpeechLocal, cancelSpeechLocal } = useTextToSpeechBrowser({ setIsSpeaking });
  
  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modeRef = useRef<'single' | 'continuous'>('single');
  const isActiveRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const lastSubmittedMessageIdRef = useRef<string | null>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const isWaitingForResponseRef = useRef(false);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const messageChainRef = useRef<string[]>([]);
  const lastAIResponseIdRef = useRef<string | null>(null);
  
  // Keep refs in sync
  useEffect(() => {
    modeRef.current = mode;
    isActiveRef.current = isActive;
    isWaitingForResponseRef.current = isWaitingForResponse;
    console.log('[VoiceUnified] Refs updated - mode:', mode, 'isActive:', isActive, 'isWaiting:', isWaitingForResponse);
  }, [mode, isActive, isWaitingForResponse]);
  
  // Debug TTS settings
  useEffect(() => {
    console.log('[VoiceUnified] TTS Settings - textToSpeech:', textToSpeech);
  }, [textToSpeech]);
  
  // Monitor audio playback for continuous mode
  useEffect(() => {
    if (!isActive || mode !== 'continuous') return;
    
    // If audio just started playing, pause recognition
    if (globalAudioPlaying && !wasPlayingRef.current) {
      console.log('[VoiceUnified] Audio started - pausing recognition');
      wasPlayingRef.current = true;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
    // If audio just stopped, resume recognition
    else if (!globalAudioPlaying && wasPlayingRef.current) {
      console.log('[VoiceUnified] Audio stopped - resuming recognition');
      wasPlayingRef.current = false;
      
      if (isActiveRef.current && mode === 'continuous' && !isWaitingForResponseRef.current) {
        setTimeout(() => startListening(), 500);
      }
    }
  }, [globalAudioPlaying, isActive, mode, isWaitingForResponse]);
  
  // TTS function using the browser TTS hook
  const speakText = useCallback((text: string) => {
    if (!textToSpeech) {
      console.log('[VoiceUnified] TTS not enabled in settings');
      return;
    }
    
    console.log('[VoiceUnified] Speaking:', text.substring(0, 50) + '...');
    setIsSpeaking(true);
    generateSpeechLocal(text);
  }, [textToSpeech, generateSpeechLocal]);
  
  // Monitor when speech ends to resume listening in continuous mode
  useEffect(() => {
    if (!isSpeaking && wasPlayingRef.current) {
      console.log('[VoiceUnified] Speech ended');
      wasPlayingRef.current = false;
      
      // In continuous mode, resume listening after speech ends
      if (isActiveRef.current && modeRef.current === 'continuous' && !isWaitingForResponseRef.current) {
        setTimeout(() => {
          console.log('[VoiceUnified] Resuming listening after speech');
          startListening();
        }, 500);
      }
    } else if (isSpeaking && !wasPlayingRef.current) {
      console.log('[VoiceUnified] Speech started');
      wasPlayingRef.current = true;
    }
  }, [isSpeaking, startListening]);
  
  // Monitor for AI responses in continuous mode
  useEffect(() => {
    if (!isActive || !latestMessage) return;
    
    const messages = getMessages() || [];
    console.log('[VoiceUnified] Message update - Latest:', latestMessage.messageId, 'IsUser:', latestMessage.isCreatedByUser, 'Parent:', latestMessage.parentMessageId);
    console.log('[VoiceUnified] Total messages:', messages.length);
    
    // Check if messages are siblings by looking at parent IDs
    const parentIds = messages.map(m => m.parentMessageId);
    const uniqueParentIds = [...new Set(parentIds)];
    console.log('[VoiceUnified] Parent ID distribution:', parentIds);
    console.log('[VoiceUnified] Unique parent IDs:', uniqueParentIds);
    
    // Count siblings for each parent
    const siblingCounts = {};
    parentIds.forEach(parentId => {
      siblingCounts[parentId] = (siblingCounts[parentId] || 0) + 1;
    });
    console.log('[VoiceUnified] Sibling counts by parent:', siblingCounts);
    
    if (!latestMessage.isCreatedByUser) {
      console.log('[VoiceUnified] AI response received');
      setIsWaitingForResponse(false);
      
      // Speak the AI response if we're in voice mode and haven't spoken it yet
      if (latestMessage.text && isActiveRef.current && latestMessage.messageId !== lastSpokenMessageIdRef.current) {
        console.log('[VoiceUnified] Speaking AI response for message:', latestMessage.messageId);
        console.log('[VoiceUnified] textToSpeech enabled:', textToSpeech);
        console.log('[VoiceUnified] Message text:', latestMessage.text.substring(0, 100) + '...');
        lastSpokenMessageIdRef.current = latestMessage.messageId;
        speakText(latestMessage.text);
      } else if (latestMessage.messageId === lastSpokenMessageIdRef.current) {
        console.log('[VoiceUnified] Already spoke this message, skipping');
        // If not speaking, resume listening in continuous mode
        if (!isSpeaking && !globalAudioPlaying && isActiveRef.current && mode === 'continuous') {
          setTimeout(() => startListening(), 500);
        }
      } else {
        console.log('[VoiceUnified] Not speaking - conditions not met:');
        console.log('  - latestMessage.text:', !!latestMessage.text);
        console.log('  - isActiveRef.current:', isActiveRef.current);
        console.log('  - Already spoken:', latestMessage.messageId === lastSpokenMessageIdRef.current);
      }
    }
  }, [latestMessage, isActive, mode, globalAudioPlaying, getMessages, speakText, textToSpeech, isSpeaking]);
  
  const stopListening = useCallback(() => {
    console.log('[VoiceUnified] Stopping listening');
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.error('[VoiceUnified] Error stopping recognition:', e);
      }
      recognitionRef.current = null;
    }
    
    setListening(false);
  }, [setListening]);
  
  const handleSubmit = useCallback((text: string) => {
    console.log('[VoiceUnified] Submitting:', text, 'Mode:', modeRef.current);
    
    // Get current messages to find the correct parent
    const messages = getMessages() || [];
    console.log('[VoiceUnified] Current messages count:', messages.length);
    
    // Log message structure to debug sibling issue
    if (messages.length > 0) {
      const lastThreeMessages = messages.slice(-3);
      console.log('[VoiceUnified] Last 3 messages:');
      lastThreeMessages.forEach((msg, idx) => {
        console.log(`  [${idx}] ID: ${msg.messageId}, Parent: ${msg.parentMessageId}, User: ${msg.isCreatedByUser}, Text: ${msg.text?.substring(0, 50)}...`);
      });
    }
    
    // Use the standard form submission to maintain conversation context
    methods.setValue('text', text);
    methods.handleSubmit((data) => {
      setIsWaitingForResponse(true);
      submitMessage(data);
    })();
    
    // Clear transcript
    setTranscript({ text: '', isFinal: false });
    
    // In single mode, stop everything
    if (modeRef.current === 'single') {
      setIsActive(false);
      setContinuousMode(false);
      stopListening();
    }
    // In continuous mode, just pause recognition
    else {
      stopListening();
    }
  }, [methods, submitMessage, setTranscript, setContinuousMode, stopListening, getMessages]);
  
  const startListening = useCallback(() => {
    if (!hasSpeechRecognition) {
      console.log('[VoiceUnified] No speech recognition available');
      return;
    }
    
    // Prevent multiple instances
    if (recognitionRef.current) {
      console.log('[VoiceUnified] Recognition already active, skipping');
      return;
    }
    
    console.log('[VoiceUnified] Starting recognition, mode:', modeRef.current, 'isActive:', isActiveRef.current);
    
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = modeRef.current === 'continuous';
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      let accumulatedTranscript = '';
      
      recognition.onstart = () => {
        console.log('[VoiceUnified] Recognition started');
        setListening(true);
        accumulatedTranscript = '';
      };
      
      // Optional: Uncomment for detailed debugging
      // recognition.onspeechstart = () => {
      //   console.log('[VoiceUnified] Speech detected!');
      // };
      
      // recognition.onspeechend = () => {
      //   console.log('[VoiceUnified] Speech ended');
      // };
      
      // recognition.onaudiostart = () => {
      //   console.log('[VoiceUnified] Audio capture started');
      // };
      
      // recognition.onaudioend = () => {
      //   console.log('[VoiceUnified] Audio capture ended');
      // };
      
      recognition.onresult = (event: any) => {
        console.log('[VoiceUnified] Recognition result event', event.results.length);
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
        console.log('[VoiceUnified] Transcript:', displayTranscript);
        
        if (displayTranscript.trim()) {
          setTranscript({ text: displayTranscript.trim(), isFinal: false });
          
          // Handle submission based on mode
          if (modeRef.current === 'single' && currentFinalTranscript) {
            // Single mode: submit immediately on final result
            handleSubmit(accumulatedTranscript.trim());
          } else if (modeRef.current === 'continuous') {
            // Continuous mode: use silence detection
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
            }
            
            silenceTimeoutRef.current = setTimeout(() => {
              if (accumulatedTranscript.trim() && !globalAudioPlaying && !isWaitingForResponseRef.current) {
                console.log('[VoiceUnified] Submitting after silence, not waiting for response');
                handleSubmit(accumulatedTranscript.trim());
              } else if (isWaitingForResponseRef.current) {
                console.log('[VoiceUnified] Skipping submission - waiting for AI response');
              }
            }, 1500);
          }
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('[VoiceUnified] Recognition error:', event.error);
        setListening(false);
        
        if (event.error === 'no-speech' && isActiveRef.current && modeRef.current === 'continuous' && !isWaitingForResponseRef.current) {
          // Only restart for no-speech in continuous mode if not waiting for response
          setTimeout(() => {
            if (isActiveRef.current && modeRef.current === 'continuous' && !isWaitingForResponseRef.current) {
              startListening();
            }
          }, 1000);
        } else if (event.error === 'aborted') {
          // Don't restart on aborted - this is intentional
          console.log('[VoiceUnified] Recognition aborted (intentional)');
        } else {
          // Show error for other cases
          showToast({
            message: `Voice recognition error: ${event.error}`,
            status: 'error',
          });
        }
      };
      
      recognition.onend = () => {
        console.log('[VoiceUnified] Recognition ended');
        setListening(false);
        recognitionRef.current = null;
        
        // In continuous mode, restart if still active AND not being stopped intentionally
        if (isActiveRef.current && modeRef.current === 'continuous' && !isWaitingForResponseRef.current) {
          setTimeout(() => {
            if (isActiveRef.current && modeRef.current === 'continuous' && !isWaitingForResponseRef.current) {
              console.log('[VoiceUnified] Restarting recognition after end');
              startListening();
            }
          }, 1000);
        }
      };
      
      recognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      console.error('[VoiceUnified] Error starting recognition:', error);
      setListening(false);
      showToast({
        message: 'Error starting voice recognition. Please check your microphone.',
        status: 'error',
      });
    }
  }, [setListening, setTranscript, handleSubmit, showToast, globalAudioPlaying, isWaitingForResponse]);
  
  const handleClick = useCallback(() => {
    // Clear any existing click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    if (isActive) {
      // Already active - stop
      console.log('[VoiceUnified] Stopping voice mode');
      setIsActive(false);
      setContinuousMode(false);
      stopListening();
      
      // Reset tracking
      messageChainRef.current = [];
      lastAIResponseIdRef.current = null;
      lastSpokenMessageIdRef.current = null;
      
      // Cancel any ongoing speech
      cancelSpeechLocal();
    } else {
      // Wait to see if it's a double-click
      clickTimeoutRef.current = setTimeout(() => {
        // Single click - single turn mode
        console.log('[VoiceUnified] Single click - activating single mode');
        setMode('single');
        setContinuousMode(false);
        setIsActive(true);
        modeRef.current = 'single';
        isActiveRef.current = true;
        
        setTimeout(() => startListening(), 100);
      }, 250); // Wait 250ms for potential double-click
    }
  }, [isActive, setContinuousMode, stopListening, startListening]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clear single-click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    console.log('[VoiceUnified] Double click detected!');
    
    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    // Cancel any ongoing speech
    cancelSpeechLocal();
    
    // Double click - continuous mode
    console.log('[VoiceUnified] Activating continuous mode');
    setMode('continuous');
    setContinuousMode(true);
    setIsActive(true);
    modeRef.current = 'continuous';
    isActiveRef.current = true;
    
    showToast({
      message: 'Continuous voice mode activated. Speak naturally and I\'ll respond when you pause.',
      status: 'info',
      duration: 3000,
    });
    
    // Start listening after a delay
    setTimeout(() => {
      console.log('[VoiceUnified] Starting listening after double click');
      startListening();
    }, 100);
  }, [setContinuousMode, showToast, startListening]);
  
  const getTooltipText = () => {
    if (!hasSpeechRecognition) return 'Voice input not supported in this browser';
    if (isActive) return mode === 'continuous' ? 'Stop continuous voice mode' : 'Stop voice input';
    return 'Single click: voice input | Double click: continuous conversation';
  };
  
  const getIconColor = () => {
    if (globalAudioPlaying) return 'text-blue-500';
    if (isWaitingForResponse) return 'text-yellow-500';
    if (isActive) return 'text-green-500';
    return 'text-muted-foreground';
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
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      // Cancel any ongoing speech
      cancelSpeechLocal();
    };
  }, [cancelSpeechLocal]);
  
  return (
    <TooltipAnchor
      description={getTooltipText()}
      render={
        <button
          type="button"
          aria-label={localize('com_ui_voice_input')}
          aria-pressed={isActive}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          disabled={disabled || !hasSpeechRecognition || isSubmitting}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors',
            'hover:bg-surface-hover',
            isActive && 'bg-surface-tertiary',
            (disabled || !hasSpeechRecognition) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {/* Sound wave icon */}
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
                'absolute -top-1 -right-1 h-3 w-3 rounded-full',
                globalAudioPlaying ? 'bg-blue-500' : isWaitingForResponse ? 'bg-yellow-500' : 'bg-green-500',
                mode === 'continuous' && !globalAudioPlaying && !isWaitingForResponse && 'animate-pulse'
              )} />
              {mode === 'continuous' && (
                <span className="absolute -bottom-1 -right-1 text-xs font-bold text-green-500">∞</span>
              )}
            </>
          )}
        </button>
      }
    />
  );
}