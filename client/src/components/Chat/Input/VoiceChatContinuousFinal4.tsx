import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize, useSubmitMessage } from '~/hooks';
import { useChatFormContext, useChatContext } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
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

interface VoiceChatContinuousProps {
  disabled?: boolean;
}

export default function VoiceChatContinuous({ disabled = false }: VoiceChatContinuousProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { submitMessage } = useSubmitMessage();
  const methods = useChatFormContext();
  const { conversation, isSubmitting, getMessages, latestMessage } = useChatContext();
  
  // Get messages for the current conversation
  const { data: messages = [] } = useGetMessagesByConvoId(conversation?.conversationId ?? '');
  
  // Get TTS settings and states
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const globalAudioPlaying = useRecoilValue(store.globalAudioPlayingFamily(0));
  
  const setContinuousMode = useSetRecoilState(voiceContinuousModeState);
  const setListening = useSetRecoilState(voiceListeningState);
  const setTranscript = useSetRecoilState(voiceTranscriptState);
  const setAIResponse = useSetRecoilState(voiceAIResponseState);
  
  const [isActive, setIsActive] = useState(false);
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
        console.log('[VoiceContinuous] Conversation established with ID:', conversation.conversationId);
        establishedConversationRef.current = true;
      }
    }
    
    // Update message count
    if (messageCount !== messageCountRef.current) {
      console.log('[VoiceContinuous] Message count changed:', messageCountRef.current, '->', messageCount);
      messageCountRef.current = messageCount;
    }
  }, [conversation?.conversationId, getMessages]);
  
  // Stop listening function
  const stopListening = useCallback(() => {
    console.log('[VoiceContinuous] Stopping listening');
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.error('[VoiceContinuous] Error stopping recognition:', e);
      }
      recognitionRef.current = null;
    }
    
    setListening(false);
  }, [setListening]);
  
  // Start speech recognition
  const startListening = useCallback(() => {
    console.log('[VoiceContinuous] startListening called - active:', isActiveRef.current, 'speaking:', isSpeakingRef.current);
    
    if (!hasSpeechRecognition || !isActiveRef.current || isSpeakingRef.current || recognitionRef.current) {
      console.log('[VoiceContinuous] Cannot start - conditions not met');
      return;
    }
    
    console.log('[VoiceContinuous] Starting recognition');
    
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      let accumulatedTranscript = '';
      
      recognition.onstart = () => {
        console.log('[VoiceContinuous] Recognition started');
        setListening(true);
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
        
        if (displayTranscript.trim()) {
          setTranscript({ text: displayTranscript.trim(), isFinal: false });
          
          // Reset silence timer
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          
          // Set new silence timer (1.5 seconds)
          silenceTimeoutRef.current = setTimeout(() => {
            if (accumulatedTranscript.trim() && !isSpeakingRef.current) {
              console.log('[VoiceContinuous] Submitting after silence:', accumulatedTranscript.trim());
              
              // Important: Check if conversation is established
              if (establishedConversationRef.current) {
                console.log('[VoiceContinuous] Using established conversation');
              } else {
                console.log('[VoiceContinuous] First message in conversation');
              }
              
              // Submit using form methods - this will use the existing conversation context
              methods.setValue('text', accumulatedTranscript.trim());
              methods.handleSubmit((data) => {
                console.log('[VoiceContinuous] Submitting message');
                setIsWaitingForResponse(true);
                
                // Submit the message - the submitMessage hook will handle conversation context
                submitMessage(data);
              })();
              
              // Clear transcript
              accumulatedTranscript = '';
              setTranscript({ text: '', isFinal: false });
              
              // Stop recognition while waiting for response
              stopListening();
            }
          }, 1500);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('[VoiceContinuous] Recognition error:', event.error);
        setListening(false);
        
        if (event.error === 'no-speech' && isActiveRef.current && !isSpeakingRef.current) {
          setTimeout(() => startListening(), 100);
        } else if (event.error !== 'aborted') {
          showToast({
            message: `Voice recognition error: ${event.error}`,
            status: 'error',
          });
        }
      };
      
      recognition.onend = () => {
        console.log('[VoiceContinuous] Recognition ended');
        setListening(false);
        recognitionRef.current = null;
        
        // Restart if still in continuous mode and not speaking
        if (isActiveRef.current && !isSpeakingRef.current && !isWaitingForResponse) {
          console.log('[VoiceContinuous] Restarting recognition');
          setTimeout(() => startListening(), 500);
        }
      };
      
      recognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      console.error('[VoiceContinuous] Error starting recognition:', error);
      setListening(false);
    }
  }, [setListening, setTranscript, methods, submitMessage, showToast, stopListening, setIsWaitingForResponse, isWaitingForResponse]);
  
  // Monitor audio playback state
  const checkAudioPlayback = useCallback(() => {
    const audioElement = document.getElementById('globalAudio') as HTMLAudioElement;
    
    if (audioElement && !audioElement.paused && !audioElement.ended) {
      // Audio is playing
      if (!isSpeaking) {
        console.log('[VoiceContinuous] TTS audio started playing');
        stopListening();
        setIsSpeaking(true);
      }
    } else {
      // Audio is not playing
      if (isSpeaking) {
        console.log('[VoiceContinuous] TTS audio stopped playing');
        setIsSpeaking(false);
        
        // Resume listening after a short delay
        if (isActiveRef.current) {
          setTimeout(() => {
            console.log('[VoiceContinuous] Resuming listening after TTS');
            startListening();
          }, 500);
        }
      }
    }
  }, [isSpeaking, stopListening, startListening]);
  
  // Set up audio monitoring when active
  useEffect(() => {
    if (isActive && textToSpeech && automaticPlayback) {
      // Check every 100ms for audio state changes
      audioCheckIntervalRef.current = setInterval(checkAudioPlayback, 100);
      
      return () => {
        if (audioCheckIntervalRef.current) {
          clearInterval(audioCheckIntervalRef.current);
        }
      };
    }
  }, [isActive, textToSpeech, automaticPlayback, checkAudioPlayback]);
  
  // Monitor for new AI messages using latestMessage
  useEffect(() => {
    if (!isActive || !latestMessage || latestMessage.isCreatedByUser) return;
    
    // Check if it's a new AI message
    if (latestMessage.messageId !== lastMessageIdRef.current && latestMessage.text) {
      console.log('[VoiceContinuous] New AI message detected:', latestMessage.messageId);
      lastMessageIdRef.current = latestMessage.messageId;
      
      if (isWaitingForResponse) {
        setIsWaitingForResponse(false);
      }
      
      // Mark conversation as established after first AI response
      if (!establishedConversationRef.current && conversation?.conversationId && conversation.conversationId !== 'new') {
        console.log('[VoiceContinuous] Conversation established after AI response');
        establishedConversationRef.current = true;
      }
      
      // TTS will be handled by StreamAudio component
      console.log('[VoiceContinuous] AI response received - TTS will handle speech');
    }
  }, [latestMessage, isActive, isWaitingForResponse, conversation]);
  
  // Simple speak function for welcome message only
  const speakWelcome = useCallback((text: string) => {
    console.log('[VoiceContinuous] Speaking welcome message');
    
    if (!window.speechSynthesis) {
      console.log('[VoiceContinuous] No speech synthesis');
      setTimeout(() => startListening(), 500);
      return;
    }
    
    stopListening();
    setIsSpeaking(true);
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onend = () => {
      console.log('[VoiceContinuous] Welcome message ended');
      setIsSpeaking(false);
      
      if (isActiveRef.current) {
        setTimeout(() => {
          console.log('[VoiceContinuous] Starting listening after welcome');
          startListening();
        }, 500);
      }
    };
    
    utterance.onerror = () => {
      console.error('[VoiceContinuous] Speech error');
      setIsSpeaking(false);
      
      if (isActiveRef.current) {
        setTimeout(() => startListening(), 500);
      }
    };
    
    window.speechSynthesis.speak(utterance);
  }, [stopListening, setIsSpeaking, startListening]);
  
  // Initialize continuous mode
  const initializeContinuousMode = useCallback(() => {
    console.log('[VoiceContinuous] Initializing continuous mode');
    console.log('[VoiceContinuous] Current conversation ID:', conversation?.conversationId);
    
    // Check if we're in an existing conversation
    const currentMessages = getMessages();
    const hasMessages = currentMessages && currentMessages.length > 0;
    const hasRealConvoId = conversation?.conversationId && conversation.conversationId !== 'new';
    
    if (hasMessages && hasRealConvoId) {
      console.log('[VoiceContinuous] Continuing existing conversation with', currentMessages.length, 'messages');
      establishedConversationRef.current = true;
    } else {
      console.log('[VoiceContinuous] Starting new conversation');
      establishedConversationRef.current = false;
    }
    
    messageCountRef.current = currentMessages?.length || 0;
    
    setIsActive(true);
    setContinuousMode(true);
    
    // Track last message
    if (latestMessage) {
      lastMessageIdRef.current = latestMessage.messageId || null;
    }
    
    // Check if TTS is enabled
    if (!textToSpeech || !automaticPlayback) {
      showToast({
        message: 'Enable Text to Speech and Automatic Playback in settings for voice responses',
        status: 'warning',
      });
    }
    
    // Speak welcome and start listening
    speakWelcome("Continuous voice mode activated. I'm listening. Speak naturally and I'll respond when you pause.");
  }, [setContinuousMode, latestMessage, speakWelcome, textToSpeech, automaticPlayback, showToast, conversation, getMessages]);
  
  const stopContinuousMode = useCallback(() => {
    console.log('[VoiceContinuous] Stopping continuous mode');
    
    setIsActive(false);
    setContinuousMode(false);
    setIsWaitingForResponse(false);
    establishedConversationRef.current = false;
    messageCountRef.current = 0;
    stopListening();
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    if (audioCheckIntervalRef.current) {
      clearInterval(audioCheckIntervalRef.current);
    }
    
    setIsSpeaking(false);
    setTranscript({ text: '', isFinal: false });
    setAIResponse({ text: '', isPlaying: false });
  }, [setContinuousMode, stopListening, setTranscript, setAIResponse, setIsSpeaking, setIsWaitingForResponse]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopContinuousMode();
    };
  }, [stopContinuousMode]);
  
  const toggleContinuousMode = useCallback(() => {
    if (isActive) {
      stopContinuousMode();
    } else {
      initializeContinuousMode();
    }
  }, [isActive, initializeContinuousMode, stopContinuousMode]);
  
  const getTooltipText = () => {
    if (!hasSpeechRecognition) return 'Continuous voice mode not supported in this browser';
    if (isActive) return 'Stop continuous voice mode';
    return 'Start continuous voice conversation';
  };
  
  const getIconColor = () => {
    if (isSpeaking) return 'text-blue-500';
    if (isWaitingForResponse) return 'text-yellow-500';
    if (isActive) return 'text-green-500';
    return 'text-muted-foreground';
  };
  
  return (
    <TooltipAnchor
      description={getTooltipText()}
      render={
        <button
          id="voice-chat-continuous"
          type="button"
          aria-label={localize('com_ui_voice_continuous')}
          onClick={toggleContinuousMode}
          disabled={disabled || !hasSpeechRecognition || isSubmitting}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors',
            'hover:bg-surface-hover',
            isActive && 'bg-surface-tertiary',
            (disabled || !hasSpeechRecognition) && 'opacity-50 cursor-not-allowed'
          )}
        >
          <svg 
            className={cn('h-5 w-5 transition-colors', getIconColor())}
            fill="none" 
            viewBox="0 0 24 24" 
            strokeWidth="2"
            stroke="currentColor"
          >
            {isActive ? (
              // Headphones icon when active
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" 
              />
            ) : (
              // Microphone with waves icon when inactive
              <g>
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" 
                />
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  d="M7.5 8.5v4M4.5 10v1m15 -1v1m-3-2.5v4"
                  className="animate-pulse"
                />
              </g>
            )}
          </svg>
          {isActive && (
            <span className={cn(
              'absolute -top-1 -right-1 h-3 w-3 rounded-full',
              isSpeaking ? 'bg-blue-500' : isWaitingForResponse ? 'bg-yellow-500' : 'bg-green-500',
              !isSpeaking && !isWaitingForResponse && 'animate-pulse'
            )} />
          )}
        </button>
      }
    />
  );
}