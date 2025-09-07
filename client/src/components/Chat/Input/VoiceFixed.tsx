import { useCallback, useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToastContext, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import useTextToSpeechBrowser from '~/hooks/Input/useTextToSpeechBrowser';
import { useSpeechToTextMutation } from '~/data-provider';
import { cn } from '~/utils';
import { 
  voiceListeningState, 
  voiceTranscriptState,
  voiceContinuousModeState 
} from '~/store/voice';
import store from '~/store';

interface VoiceFixedProps {
  disabled?: boolean;
  ask: (data: { text: string }) => void;
  methods: any;
}

export default function VoiceFixed({ disabled = false, ask, methods }: VoiceFixedProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { isSubmitting, latestMessage } = useChatContext();
  const { setValue, reset } = methods;
  
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
  
  console.log('[VoiceFixed] Settings:', { speechToTextEnabled, engineSTT });
  
  // Initialize speech-to-text mutation for external mode
  const { mutate: processAudioMutation } = useSpeechToTextMutation({
    onSuccess: (data) => {
      console.log('[VoiceFixed] External STT success:', data.text);
      if (data.text && data.text.trim()) {
        handleTranscription(data.text.trim());
      }
    },
    onError: (error: any) => {
      console.error('[VoiceFixed] External STT error:', error);
      showToast({
        message: 'Failed to transcribe audio. Make sure STT is configured on server.',
        status: 'error',
      });
      setIsActive(false);
    },
  });
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const finalTranscriptRef = useRef('');
  
  // Handle transcription result
  const handleTranscription = useCallback((text: string) => {
    console.log('[VoiceFixed] Submitting:', text);
    
    // Submit using the ask function like AudioRecorder does
    ask({ text });
    reset({ text: '' });
    
    // Clear transcript
    setTranscript({ text: '', isFinal: false });
    finalTranscriptRef.current = '';
    
    // Set waiting for response
    setIsWaitingForResponse(true);
  }, [ask, reset, setTranscript]);
  
  // TTS function
  const speakText = useCallback((text: string) => {
    if (!textToSpeech) {
      console.log('[VoiceFixed] TTS not enabled');
      return;
    }
    
    console.log('[VoiceFixed] Speaking AI response');
    try {
      generateSpeechLocal(text);
    } catch (error) {
      console.error('[VoiceFixed] TTS error:', error);
    }
  }, [textToSpeech, generateSpeechLocal]);
  
  // Browser Speech Recognition
  const startBrowserRecognition = useCallback(() => {
    if (!window.isSecureContext) {
      showToast({
        message: 'Speech recognition requires HTTPS or localhost',
        status: 'error',
      });
      setIsActive(false);
      return;
    }
    
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      showToast({
        message: 'Speech recognition is not supported in your browser',
        status: 'error',
      });
      setIsActive(false);
      return;
    }
    
    console.log('[VoiceFixed] Starting browser recognition');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      console.log('[VoiceFixed] Browser recognition started');
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
      // Update the text field as user speaks
      setValue('text', fullTranscript);
    };
    
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.error('[VoiceFixed] Recognition error:', event.error);
      showToast({ message: 'Speech recognition error', status: 'error' });
      setIsActive(false);
    };
    
    recognition.onend = () => {
      console.log('[VoiceFixed] Browser recognition ended');
      
      // Clear the reference
      recognitionRef.current = null;
      
      // Submit if we have transcript
      if (finalTranscriptRef.current.trim()) {
        handleTranscription(finalTranscriptRef.current.trim());
      }
      
      setListening(false);
    };
    
    try {
      recognition.start();
      console.log('[VoiceFixed] Recognition.start() called');
    } catch (error) {
      console.error('[VoiceFixed] Failed to start recognition:', error);
      showToast({
        message: 'Failed to start speech recognition',
        status: 'error',
      });
      setIsActive(false);
    }
  }, [isActive, isWaitingForResponse, setListening, setTranscript, setValue, showToast, handleTranscription]);
  
  // MediaRecorder for external STT
  const startMediaRecorder = useCallback(async () => {
    try {
      console.log('[VoiceFixed] Starting MediaRecorder for external STT');
      
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
        console.log('[VoiceFixed] MediaRecorder stopped');
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
          }, 1000);
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
      console.error('[VoiceFixed] Error starting MediaRecorder:', error);
      showToast({
        message: 'Failed to start recording. Check microphone permissions.',
        status: 'error',
      });
      setIsActive(false);
    }
  }, [isActive, isWaitingForResponse, setListening, setTranscript, processAudioMutation, showToast]);
  
  // Stop all recording
  const stopAll = useCallback(() => {
    console.log('[VoiceFixed] Stopping all');
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.log('[VoiceFixed] Error aborting recognition:', e);
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
  
  // Monitor for new AI responses
  useEffect(() => {
    if (!isActive || !isWaitingForResponse || !latestMessage) return;
    
    // Check if this is a new AI message we haven't spoken
    if (!latestMessage.isCreatedByUser && 
        latestMessage.messageId && 
        latestMessage.messageId !== lastSpokenMessageIdRef.current) {
      
      console.log('[VoiceFixed] New AI response detected');
      setIsWaitingForResponse(false);
      lastSpokenMessageIdRef.current = latestMessage.messageId;
      
      if (latestMessage.text && textToSpeech) {
        speakText(latestMessage.text);
      }
    }
  }, [latestMessage, isActive, isWaitingForResponse, textToSpeech, speakText]);
  
  // Resume listening after TTS completes
  useEffect(() => {
    if (!isActive || isWaitingForResponse || isSpeaking || globalAudioPlaying) return;
    
    // Check if we need to restart listening
    const needsRestart = !recognitionRef.current && !mediaRecorderRef.current;
    
    if (needsRestart) {
      console.log('[VoiceFixed] Resuming listening after TTS');
      const timer = setTimeout(() => {
        if (isActive && !isWaitingForResponse && !isSpeaking) {
          if (engineSTT === 'browser') {
            startBrowserRecognition();
          } else {
            startMediaRecorder();
          }
        }
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isActive, isWaitingForResponse, isSpeaking, globalAudioPlaying, engineSTT, startBrowserRecognition, startMediaRecorder]);
  
  // Handle click
  const handleClick = useCallback(() => {
    if (isActive) {
      // Stop
      console.log('[VoiceFixed] Deactivating voice mode');
      setIsActive(false);
      setContinuousMode(false);
      stopAll();
      cancelSpeechLocal();
      lastSpokenMessageIdRef.current = null;
      setIsWaitingForResponse(false);
    } else {
      // Start
      console.log('[VoiceFixed] Activating voice mode');
      setIsActive(true);
      setContinuousMode(true);
      lastSpokenMessageIdRef.current = null;
      setIsWaitingForResponse(false);
      
      showToast({
        message: `Voice mode activated (${engineSTT === 'browser' ? 'Browser' : 'External'} STT)`,
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
  }, [isActive, engineSTT, setContinuousMode, stopAll, cancelSpeechLocal, showToast, startBrowserRecognition, startMediaRecorder]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
      cancelSpeechLocal();
    };
  }, [stopAll, cancelSpeechLocal]);
  
  const getIconColor = () => {
    if (globalAudioPlaying || isSpeaking) return 'text-blue-500';
    if (isWaitingForResponse) return 'text-yellow-500';
    if (isActive) return 'text-green-500';
    return 'text-muted-foreground';
  };
  
  if (!speechToTextEnabled) {
    return null;
  }
  
  return (
    <TooltipAnchor
      description={isActive ? 'Stop voice mode' : `Voice mode (${engineSTT})`}
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