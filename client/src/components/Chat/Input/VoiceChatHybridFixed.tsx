import { useCallback, useRef, useState, useEffect } from 'react';
import { useToastContext, TooltipAnchor, Spinner } from '@librechat/client';
import { useLocalize, useSubmitMessage } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { cn } from '~/utils';
import { useSetRecoilState } from 'recoil';
import { voiceListeningState, voiceTranscriptState, voiceAIResponseState } from '~/store/voice';

// Check for browser speech recognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasSpeechRecognition = !!SpeechRecognition;

interface VoiceChatHybridProps {
  disabled?: boolean;
}

export default function VoiceChatHybridFixed({ disabled = false }: VoiceChatHybridProps) {
  const setListening = useSetRecoilState(voiceListeningState);
  const setTranscript = useSetRecoilState(voiceTranscriptState);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { submitMessage } = useSubmitMessage();
  const methods = useChatFormContext();
  
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [browserSupport, setBrowserSupport] = useState<'full' | 'partial' | 'none'>('none');
  const finalTranscriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Check browser support
    if (hasSpeechRecognition) {
      setBrowserSupport('full');
    } else {
      setBrowserSupport('none');
    }
  }, []);
  
  // Initialize browser speech recognition
  const initializeSpeechRecognition = useCallback(() => {
    if (!hasSpeechRecognition) {
      showToast({
        message: 'Speech recognition not supported in this browser. Please use Chrome or Edge.',
        status: 'error',
      });
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let lastTranscriptTime = Date.now();
    let accumulatedTranscript = '';
    
    recognition.onstart = () => {
      console.log('[VoiceChatHybrid] Speech recognition started');
      setListening(true);
      setIsRecording(true);
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
      
      // Update accumulated transcript with any new final results
      if (currentFinalTranscript) {
        accumulatedTranscript += currentFinalTranscript;
      }
      
      // Display the full transcript (accumulated + interim)
      const displayTranscript = accumulatedTranscript + interimTranscript;
      
      if (displayTranscript.trim()) {
        setTranscript({ text: displayTranscript.trim(), isFinal: false });
        lastTranscriptTime = Date.now();
        
        // Clear any existing timeout
        if (finalTranscriptTimeoutRef.current) {
          clearTimeout(finalTranscriptTimeoutRef.current);
        }
        
        // Set a new timeout to submit after 1.5 seconds of silence
        finalTranscriptTimeoutRef.current = setTimeout(() => {
          if (accumulatedTranscript.trim()) {
            console.log('[VoiceChatHybrid] Submitting after silence:', accumulatedTranscript.trim());
            
            // Submit using the form methods to ensure proper handling
            methods.setValue('text', accumulatedTranscript.trim());
            methods.handleSubmit((data) => {
              submitMessage(data);
            })();
            
            // Stop recording after submission
            stopRecording();
          }
        }, 1500);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[VoiceChatHybrid] Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        showToast({
          message: `Speech recognition error: ${event.error}`,
          status: 'error',
        });
      }
      stopRecording();
    };
    
    recognition.onend = () => {
      console.log('[VoiceChatHybrid] Speech recognition ended');
      // Don't stop recording here, let the timeout handle it
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  }, [showToast, setListening, setTranscript, submitMessage, methods]);
  
  const stopRecording = useCallback(() => {
    if (finalTranscriptTimeoutRef.current) {
      clearTimeout(finalTranscriptTimeoutRef.current);
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setListening(false);
    setTranscript({ text: '', isFinal: false });
  }, [setListening, setTranscript]);
  
  const toggleVoice = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      initializeSpeechRecognition();
    }
  }, [isRecording, stopRecording, initializeSpeechRecognition]);
  
  // Render appropriate icon based on state
  const renderIcon = () => {
    const baseClasses = "h-4 w-4";
    
    if (isRecording) {
      return (
        <svg className={cn(baseClasses, "stroke-red-500 animate-pulse")} fill="none" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      );
    }
    
    return (
      <svg className={cn(baseClasses, "stroke-text-secondary")} fill="none" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    );
  };
  
  const getTooltipText = () => {
    if (browserSupport === 'none') {
      return 'Speech recognition not supported in this browser';
    }
    return isRecording ? 'Stop recording' : 'Start voice input';
  };
  
  return (
    <TooltipAnchor
      description={getTooltipText()}
      render={
        <button
          id="voice-chat-hybrid"
          type="button"
          aria-label={localize('com_ui_voice_chat')}
          onClick={toggleVoice}
          disabled={disabled || browserSupport === 'none'}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
            isRecording && 'bg-red-50 dark:bg-red-900/20',
            browserSupport === 'none' && 'opacity-50 cursor-not-allowed',
          )}
        >
          {renderIcon()}
        </button>
      }
    />
  );
}