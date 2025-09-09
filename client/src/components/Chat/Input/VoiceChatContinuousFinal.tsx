import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
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
  const { conversationId: urlConversationId } = useParams();
  const { showToast } = useToastContext();
  const { submitMessage } = useSubmitMessage();
  const methods = useChatFormContext();
  const { conversation, isSubmitting, latestMessage, ask } = useChatContext();
  
  // Log conversation details
  console.log('[VoiceContinuousFinal] Conversation:', {
    conversationId: conversation?.conversationId,
    urlConversationId,
    messagesCount: conversation?.messages?.length,
    endpoint: conversation?.endpoint,
  });
  
  // Get TTS settings
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const globalAudioPlaying = useRecoilValue(store.globalAudioPlayingFamily(0));
  
  // Simple state - following debug component pattern
  const [isActive, setIsActive] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  
  const recognitionRef = useRef<any>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const isActiveRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  
  // Track conversation ID once it's assigned
  useEffect(() => {
    // Prefer URL conversation ID over context conversation ID
    const effectiveConversationId = urlConversationId && urlConversationId !== 'new' 
      ? urlConversationId 
      : conversation?.conversationId;
    
    if (effectiveConversationId && 
        effectiveConversationId !== 'new' && 
        effectiveConversationId !== 'search' &&
        effectiveConversationId !== conversationIdRef.current) {
      console.log('[VoiceContinuousFinal] Conversation ID updated:', effectiveConversationId);
      conversationIdRef.current = effectiveConversationId;
    }
  }, [urlConversationId, conversation?.conversationId]);
  
  // Start recognition - EXACT pattern from debug component
  const startRecognition = useCallback(() => {
    if (!hasSpeechRecognition) {
      showToast({
        message: 'Speech recognition not supported in this browser',
        status: 'error',
      });
      return;
    }
    
    // Don't start if we're not active
    if (!isActiveRef.current) {
      console.log('[VoiceContinuousFinal] Not starting recognition - button is not active');
      return;
    }
    
    // Don't start if we already have a recognition instance
    if (recognitionRef.current) {
      console.log('[VoiceContinuousFinal] Recognition already exists, not starting new one');
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
      // Check if we're still active
      if (!isActiveRef.current) {
        console.log('[VoiceContinuousFinal] Ignoring results - button is not active');
        return;
      }
      
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
          if (!isActiveRef.current) {
            console.log('[VoiceContinuousFinal] Not submitting - button is not active');
            return;
          }
          
          console.log('[VoiceContinuousFinal] Submitting:', finalTranscript.trim());
          console.log('[VoiceContinuousFinal] Conversation at submit:', {
            conversationId: conversation?.conversationId,
            messagesCount: conversation?.messages?.length,
            latestMessageId: latestMessage?.messageId,
          });
          setTurnCount(prev => prev + 1);
          
          // Submit the message
          const messageText = finalTranscript.trim();
          console.log('[VoiceContinuousFinal] Submitting:', messageText);
          console.log('[VoiceContinuousFinal] Using stored conversationId:', conversationIdRef.current);
          
          // Use ask directly to have more control over conversation ID
          if (conversationIdRef.current && conversationIdRef.current !== 'new') {
            // We have an existing conversation, use it
            ask({
              text: messageText,
              conversationId: conversationIdRef.current,
            });
          } else {
            // New conversation, let the normal flow handle it
            methods.setValue('text', messageText);
            methods.handleSubmit((data) => {
              submitMessage(data);
            })();
          }
          
          // Clear transcript but keep recognition active
          finalTranscript = '';
        }, 1500);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.log('[VoiceContinuousFinal] Error:', event.error);
      if (event.error !== 'aborted' && isActiveRef.current) {
        showToast({ message: `Error: ${event.error}`, status: 'error' });
      }
    };
    
    recognition.onend = () => {
      console.log('[VoiceContinuousFinal] Recognition ended, isActive:', isActiveRef.current);
      recognitionRef.current = null;
      
      // Clear any pending timers
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }
      
      // If still active, restart recognition
      if (isActiveRef.current) {
        console.log('[VoiceContinuousFinal] Restarting recognition because still active');
        setTimeout(() => {
          if (isActiveRef.current && !recognitionRef.current) {
            startRecognition();
          }
        }, 500);
      }
    };
    
    recognitionRef.current = recognition;
    
    try {
      recognition.start();
    } catch (error) {
      console.log('[VoiceContinuousFinal] Failed to start:', error);
      recognitionRef.current = null;
    }
  }, [methods, submitMessage, showToast, conversation, latestMessage, ask]);
  
  // Monitor AI responses - EXACT pattern from debug component
  useEffect(() => {
    if (!latestMessage || !isActive) return;
    
    if (!latestMessage.isCreatedByUser && latestMessage.messageId !== lastMessageIdRef.current) {
      console.log('[VoiceContinuousFinal] AI Response detected:', {
        messageId: latestMessage.messageId,
        conversationId: latestMessage.conversationId,
        text: latestMessage.text?.substring(0, 50) + '...'
      });
      console.log('[VoiceContinuousFinal] Current conversation state:', {
        conversationId: conversation?.conversationId,
        messagesCount: conversation?.messages?.length
      });
      lastMessageIdRef.current = latestMessage.messageId;
      
      // Try to resume after a delay
      setTimeout(() => {
        console.log('[VoiceContinuousFinal] Attempting to resume recognition...');
        console.log('[VoiceContinuousFinal] Conversation before resume:', conversation?.conversationId);
        if (isActiveRef.current && !recognitionRef.current) {
          startRecognition();
        } else {
          console.log('[VoiceContinuousFinal] Cannot resume - active:', isActiveRef.current, 'recognition:', !!recognitionRef.current);
        }
      }, 1000);
    }
  }, [latestMessage, isActive, startRecognition, conversation]);
  
  // Toggle active state
  const toggle = useCallback(() => {
    if (isActive) {
      console.log('[VoiceContinuousFinal] Deactivating');
      setIsActive(false);
      // Don't clear conversationIdRef - we want to keep it for the session
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } else {
      console.log('[VoiceContinuousFinal] Activating continuous mode');
      console.log('[VoiceContinuousFinal] Current conversation:', conversation?.conversationId);
      setIsActive(true);
      setTurnCount(0);
      // Delay starting recognition to ensure state is updated
      setTimeout(() => startRecognition(), 100);
      
      showToast({
        message: 'Continuous voice mode activated. Speak naturally.',
        status: 'info',
        duration: 3000,
      });
    }
  }, [isActive, startRecognition, showToast, conversation]);
  
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