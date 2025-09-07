import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize, useSubmitMessage } from '~/hooks';
import { useChatFormContext, useChatContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

// Debug component to understand the issue
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function VoiceContinuousDebug({ disabled = false }: { disabled?: boolean }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { submitMessage } = useSubmitMessage();
  const methods = useChatFormContext();
  const { conversation, isSubmitting, latestMessage } = useChatContext();
  
  // Get TTS settings
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const globalAudioPlaying = useRecoilValue(store.globalAudioPlayingFamily(0));
  
  // Local state
  const [isActive, setIsActive] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  
  const recognitionRef = useRef<any>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  
  // Add to debug log
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[DEBUG ${timestamp}] ${message}`);
    setDebugLog(prev => [...prev, `${timestamp}: ${message}`]);
  };
  
  // Start recognition
  const startRecognition = useCallback(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      addLog('❌ Speech recognition not supported');
      return;
    }
    
    addLog('🎤 Starting recognition...');
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let finalTranscript = '';
    let silenceTimer: any = null;
    
    recognition.onstart = () => {
      addLog('✅ Recognition started');
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
      addLog(`📝 Transcript: "${fullTranscript}"`);
      
      // Clear existing timer
      if (silenceTimer) clearTimeout(silenceTimer);
      
      // Set new timer for submission
      if (finalTranscript.trim()) {
        silenceTimer = setTimeout(() => {
          addLog(`📤 Submitting: "${finalTranscript.trim()}"`);
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
      addLog(`❌ Error: ${event.error}`);
      if (event.error !== 'aborted') {
        showToast({ message: `Error: ${event.error}`, status: 'error' });
      }
    };
    
    recognition.onend = () => {
      addLog('⏹️ Recognition ended');
      recognitionRef.current = null;
    };
    
    recognitionRef.current = recognition;
    
    try {
      recognition.start();
    } catch (error) {
      addLog(`❌ Failed to start: ${error}`);
    }
  }, [methods, submitMessage, showToast]);
  
  // Monitor AI responses
  useEffect(() => {
    if (!latestMessage || !isActive) return;
    
    if (!latestMessage.isCreatedByUser && latestMessage.messageId !== lastMessageIdRef.current) {
      addLog(`🤖 AI Response detected: ${latestMessage.messageId}`);
      lastMessageIdRef.current = latestMessage.messageId;
      
      // Try to resume after a delay
      setTimeout(() => {
        addLog('🔄 Attempting to resume recognition...');
        if (isActive && !recognitionRef.current) {
          startRecognition();
        } else {
          addLog(`❌ Cannot resume - active: ${isActive}, recognition: ${!!recognitionRef.current}`);
        }
      }, 1000);
    }
  }, [latestMessage, isActive, startRecognition]);
  
  // Monitor audio playback
  useEffect(() => {
    if (!isActive) return;
    
    addLog(`🔊 Audio playing: ${globalAudioPlaying}`);
    
    if (!globalAudioPlaying && !recognitionRef.current) {
      addLog('🎯 Audio stopped, starting recognition');
      setTimeout(() => startRecognition(), 500);
    }
  }, [globalAudioPlaying, isActive, startRecognition]);
  
  // Toggle active state
  const toggle = useCallback(() => {
    if (isActive) {
      addLog('🛑 Deactivating');
      setIsActive(false);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    } else {
      addLog('🚀 Activating continuous mode');
      setIsActive(true);
      setDebugLog([]);
      setTurnCount(0);
      startRecognition();
    }
  }, [isActive, startRecognition]);
  
  return (
    <div className="relative">
      <TooltipAnchor
        description="Debug Continuous Voice"
        render={
          <button
            type="button"
            aria-label="Debug voice"
            onClick={toggle}
            disabled={disabled || isSubmitting}
            className={cn(
              'flex size-9 items-center justify-center rounded-full p-1 transition-colors',
              'hover:bg-surface-hover',
              isActive && 'bg-red-500 text-white'
            )}
          >
            🐛
          </button>
        }
      />
      
      {/* Debug panel */}
      {isActive && (
        <div className="absolute bottom-12 right-0 w-96 max-h-64 overflow-y-auto bg-black/90 text-white text-xs p-2 rounded-lg">
          <div className="font-bold mb-1">Debug Log (Turn {turnCount}):</div>
          {debugLog.map((log, i) => (
            <div key={i} className="mb-0.5">{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}