import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize, useSubmitMessage } from '~/hooks';
import { useChatFormContext, useChatContext } from '~/Providers';
import useTextToSpeechBrowser from '~/hooks/Input/useTextToSpeechBrowser';
import { useSpeechToTextMutation } from '~/data-provider';
import { cn } from '~/utils';
import { 
  voiceListeningState, 
  voiceTranscriptState, 
  voiceAIResponseState,
  voiceContinuousModeState 
} from '~/store/voice';
import store from '~/store';

interface VoiceUnifiedFixedProps {
  disabled?: boolean;
}

export default function VoiceUnifiedFixed({ disabled = false }: VoiceUnifiedFixedProps) {
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
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Initialize TTS hook
  const { generateSpeechLocal, cancelSpeechLocal } = useTextToSpeechBrowser({ setIsSpeaking });
  
  // Check if STT is enabled and the engine type
  const speechToTextEnabled = useRecoilValue(store.speechToText);
  const engineSTT = useRecoilValue(store.engineSTT);
  
  // Initialize speech-to-text mutation for external mode
  const { mutate: processAudioMutation } = useSpeechToTextMutation({
    onSuccess: (data) => {
      console.log('[VoiceUnifiedFixed] Transcription success:', data.text);
      if (data.text && data.text.trim()) {
        handleTranscription(data.text);
      }
    },
    onError: (error: any) => {
      console.error('[VoiceUnifiedFixed] Transcription error:', error);
      showToast({
        message: 'Failed to transcribe audio',
        status: 'error',
      });
    },
  });
  
  // Refs for tracking state without causing re-renders
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const finalTranscriptRef = useRef('');
  
  // Handle transcription result
  const handleTranscription = useCallback((text: string) => {
    console.log('[VoiceUnifiedFixed] Handling transcription:', text);
    
    // Submit the text
    methods.setValue('text', text);
    methods.handleSubmit((data) => {
      setIsWaitingForResponse(true);
      submitMessage(data);
    })();
    
    // Clear transcript
    setTranscript({ text: '', isFinal: false });
    finalTranscriptRef.current = '';
  }, [methods, submitMessage, setTranscript]);
  
  // TTS function
  const speakText = useCallback((text: string) => {
    if (!textToSpeech) {
      console.log('[VoiceUnifiedFixed] TTS not enabled');
      return;
    }
    
    console.log('[VoiceUnifiedFixed] Speaking text');
    generateSpeechLocal(text);
  }, [textToSpeech, generateSpeechLocal]);
  
  // Browser Speech Recognition
  const startBrowserRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      showToast({
        message: 'Speech recognition is not supported in your browser',
        status: 'error',
      });
      return;
    }
    
    console.log('[VoiceUnifiedFixed] Starting browser recognition');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      console.log('[VoiceUnifiedFixed] Browser recognition started');
      setListening(true);
      setTranscript({ text: '🎤 Listening...', isFinal: false });
      finalTranscriptRef.current = '';
    };
    
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = finalTranscriptRef.current;
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      
      finalTranscriptRef.current = finalTranscript;
      const fullTranscript = finalTranscript + interimTranscript;
      setTranscript({ text: fullTranscript || '🎤 Listening...', isFinal: false });
    };
    
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.error('[VoiceUnifiedFixed] Recognition error:', event.error);
      showToast({ message: 'Speech recognition error', status: 'error' });
      stopRecognition();
    };
    
    recognition.onend = () => {
      console.log('[VoiceUnifiedFixed] Browser recognition ended');
      
      // Submit if we have transcript
      if (finalTranscriptRef.current.trim()) {
        handleTranscription(finalTranscriptRef.current.trim());
      }
      
      setListening(false);
      
      // Restart if still active and not waiting
      if (isActive && !isWaitingForResponse) {
        setTimeout(() => {
          if (isActive) {
            startBrowserRecognition();
          }
        }, 500);
      }
    };
    
    try {
      recognition.start();
    } catch (error) {
      console.error('[VoiceUnifiedFixed] Failed to start recognition:', error);
      showToast({
        message: 'Failed to start speech recognition',
        status: 'error',
      });
    }
  }, [isActive, isWaitingForResponse, setListening, setTranscript, showToast, handleTranscription]);
  
  // MediaRecorder for external STT
  const startMediaRecorder = useCallback(async () => {
    try {
      console.log('[VoiceUnifiedFixed] Starting MediaRecorder');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        console.log('[VoiceUnifiedFixed] MediaRecorder stopped');
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        if (audioBlob.size > 1000) {
          const formData = new FormData();
          formData.append('audio', audioBlob, `recording.${mimeType.includes('webm') ? 'webm' : 'm4a'}`);
          processAudioMutation(formData);
        }
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        
        // Restart if still active
        if (isActive && !isWaitingForResponse) {
          setTimeout(() => {
            if (isActive) {
              startMediaRecorder();
            }
          }, 500);
        }
      };
      
      mediaRecorderRef.current.start();
      setListening(true);
      setTranscript({ text: '🎤 Recording...', isFinal: false });
      
      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 5000);
      
    } catch (error) {
      console.error('[VoiceUnifiedFixed] Error starting MediaRecorder:', error);
      showToast({
        message: 'Failed to start recording',
        status: 'error',
      });
    }
  }, [isActive, isWaitingForResponse, setListening, setTranscript, processAudioMutation, showToast]);
  
  // Stop recognition/recording
  const stopRecognition = useCallback(() => {
    console.log('[VoiceUnifiedFixed] Stopping recognition');
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.log('[VoiceUnifiedFixed] Error aborting recognition:', e);
      }
      recognitionRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    
    setListening(false);
  }, [setListening]);
  
  // Monitor for AI responses
  useEffect(() => {
    if (!isActive || !isWaitingForResponse || !latestMessage) return;
    
    if (!latestMessage.isCreatedByUser && latestMessage.messageId !== lastSpokenMessageIdRef.current) {
      console.log('[VoiceUnifiedFixed] New AI response detected');
      setIsWaitingForResponse(false);
      lastSpokenMessageIdRef.current = latestMessage.messageId;
      
      if (latestMessage.text && textToSpeech) {
        speakText(latestMessage.text);
      }
    }
  }, [latestMessage, isActive, isWaitingForResponse, textToSpeech, speakText]);
  
  // Resume after TTS completes
  useEffect(() => {
    if (!isSpeaking && isActive && !isWaitingForResponse) {
      // Small delay before resuming
      const timer = setTimeout(() => {
        if (isActive && !isWaitingForResponse) {
          if (engineSTT === 'browser') {
            startBrowserRecognition();
          } else {
            startMediaRecorder();
          }
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isSpeaking, isActive, isWaitingForResponse, engineSTT, startBrowserRecognition, startMediaRecorder]);
  
  // Handle click
  const handleClick = useCallback(() => {
    if (isActive) {
      // Stop
      console.log('[VoiceUnifiedFixed] Stopping voice mode');
      setIsActive(false);
      setContinuousMode(false);
      stopRecognition();
      cancelSpeechLocal();
      lastSpokenMessageIdRef.current = null;
    } else {
      // Start
      console.log('[VoiceUnifiedFixed] Starting voice mode');
      setIsActive(true);
      setContinuousMode(true);
      lastSpokenMessageIdRef.current = null;
      
      const modeName = engineSTT === 'browser' ? 'Browser Speech' : 'External STT';
      showToast({
        message: `Voice mode activated (${modeName})`,
        status: 'info',
        duration: 2000,
      });
      
      // Start recognition
      if (engineSTT === 'browser') {
        startBrowserRecognition();
      } else {
        startMediaRecorder();
      }
    }
  }, [isActive, engineSTT, setContinuousMode, stopRecognition, cancelSpeechLocal, showToast, startBrowserRecognition, startMediaRecorder]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecognition();
      cancelSpeechLocal();
    };
  }, [stopRecognition, cancelSpeechLocal]);
  
  const getIconColor = () => {
    if (globalAudioPlaying || isSpeaking) return 'text-blue-500';
    if (isWaitingForResponse) return 'text-yellow-500';
    if (isActive) return 'text-green-500';
    return 'text-muted-foreground';
  };
  
  return (
    <TooltipAnchor
      description={isActive ? 'Stop voice mode' : `Voice mode (${engineSTT === 'browser' ? 'Browser' : 'External'})`}
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
            <span className={cn(
              'absolute -top-1 -right-1 h-3 w-3 rounded-full',
              globalAudioPlaying || isSpeaking ? 'bg-blue-500' : 
              isWaitingForResponse ? 'bg-yellow-500' : 'bg-green-500',
              'animate-pulse'
            )} />
          )}
        </button>
      }
    />
  );
}