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

interface VoiceUnifiedMediaProps {
  disabled?: boolean;
}

export default function VoiceUnifiedMedia({ disabled = false }: VoiceUnifiedMediaProps) {
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
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  
  // Initialize TTS hook
  const { generateSpeechLocal, cancelSpeechLocal } = useTextToSpeechBrowser({ setIsSpeaking });
  
  // Check if STT is enabled and the engine type
  const speechToTextEnabled = useRecoilValue(store.speechToText);
  const engineSTT = useRecoilValue(store.engineSTT);
  
  console.log('[VoiceUnifiedMedia] STT settings:', { speechToTextEnabled, engineSTT });
  
  // Web Speech API for browser mode
  const recognitionRef = useRef<any>(null);
  const [transcript, setTranscriptState] = useState('');
  const finalTranscriptRef = useRef('');
  
  // Initialize speech-to-text mutation
  const { mutate: processAudioMutation } = useSpeechToTextMutation({
    onSuccess: (data) => {
      console.log('[VoiceUnifiedMedia] Transcription success:', data.text);
      setIsProcessingAudio(false);
      
      if (data.text && data.text.trim()) {
        setTranscript({ text: data.text, isFinal: true });
        
        // Submit the transcribed text
        if (modeRef.current === 'continuous') {
          setTimeout(() => {
            handleSubmit(data.text);
          }, 500);
        } else {
          handleSubmit(data.text);
        }
      } else {
        showToast({
          message: 'No speech detected. Please speak clearly.',
          status: 'warning',
        });
      }
    },
    onError: (error: any) => {
      console.error('[VoiceUnifiedMedia] Transcription error:', error);
      console.error('[VoiceUnifiedMedia] Error details:', {
        message: error?.message,
        response: error?.response,
        status: error?.response?.status,
        data: error?.response?.data,
        stack: error?.stack
      });
      setIsProcessingAudio(false);
      
      // More specific error messages
      let errorMessage = 'Failed to transcribe audio. Please try again.';
      if (error?.response?.status === 404) {
        errorMessage = 'Speech-to-text service not available. The server may not have STT configured. Please check your LibreChat server configuration for STT/TTS settings.';
      } else if (error?.response?.status === 401 || error?.response?.status === 403) {
        errorMessage = 'Speech-to-text service requires authentication or proper API keys. Please check server configuration.';
      } else if (error?.response?.status === 413) {
        errorMessage = 'Audio file too large. Please speak for a shorter duration.';
      } else if (error?.response?.status === 400) {
        errorMessage = 'Invalid audio format. Please try again.';
      } else if (error?.response?.status === 500 || error?.response?.status === 502) {
        errorMessage = 'Server error with speech-to-text service. The STT provider may be down or misconfigured.';
      } else if (error?.message?.includes('Network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error?.message) {
        errorMessage = `Transcription error: ${error.message}`;
      }
      
      showToast({
        message: errorMessage,
        status: 'error',
      });
    },
  });
  
  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  
  // Continuous mode refs
  const modeRef = useRef<'single' | 'continuous'>('single');
  const isActiveRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const wasSpeakingRef = useRef(false);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const isWaitingForResponseRef = useRef(false);
  
  // Keep refs in sync
  useEffect(() => {
    modeRef.current = mode;
    isActiveRef.current = isActive;
    isWaitingForResponseRef.current = isWaitingForResponse;
    isRecordingRef.current = isRecording;
  }, [mode, isActive, isWaitingForResponse, isRecording]);
  
  // Create refs for functions to avoid circular dependencies
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);

  // Monitor audio playback for continuous mode
  useEffect(() => {
    if (!isActive || mode !== 'continuous') return;
    
    if (globalAudioPlaying && !wasPlayingRef.current) {
      console.log('[VoiceUnifiedMedia] Audio started - pausing recording');
      wasPlayingRef.current = true;
      if (isRecording) {
        if (engineSTT === 'browser' && stopListeningRef.current) {
          stopListeningRef.current();
        } else if (engineSTT === 'external' && stopRecordingRef.current) {
          stopRecordingRef.current();
        }
      }
    } else if (!globalAudioPlaying && wasPlayingRef.current) {
      console.log('[VoiceUnifiedMedia] Audio stopped - resuming recording');
      wasPlayingRef.current = false;
      
      if (isActiveRef.current && mode === 'continuous' && !isWaitingForResponseRef.current) {
        setTimeout(() => {
          if (isActiveRef.current && !isRecordingRef.current) {
            console.log('[VoiceUnifiedMedia] Resuming after global audio stopped');
            if (engineSTT === 'browser' && startListeningRef.current) {
              startListeningRef.current();
            } else if (engineSTT === 'external' && startRecordingRef.current) {
              startRecordingRef.current();
            }
          }
        }, 500);
      }
    }
  }, [globalAudioPlaying, isActive, mode, isWaitingForResponse, isRecording, engineSTT]);
  
  // TTS function
  const speakText = useCallback((text: string) => {
    if (!textToSpeech) {
      console.log('[VoiceUnifiedMedia] TTS not enabled in settings');
      return;
    }
    
    console.log('[VoiceUnifiedMedia] Speaking:', text.substring(0, 50) + '...');
    
    // Use browser's built-in speech synthesis if generateSpeechLocal fails
    try {
      generateSpeechLocal(text);
    } catch (error) {
      console.log('[VoiceUnifiedMedia] Falling back to default browser TTS');
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [textToSpeech, generateSpeechLocal, setIsSpeaking]);
  
  // Create a stable reference to messages to monitor changes
  const messages = getMessages();
  const messagesLength = messages?.length || 0;

  // Monitor all messages for AI responses
  useEffect(() => {
    if (!isActive || !isWaitingForResponse) return;
    
    const currentMessages = getMessages();
    if (!currentMessages || currentMessages.length === 0) {
      console.log('[VoiceUnifiedMedia] No messages available');
      return;
    }
    
    console.log('[VoiceUnifiedMedia] Total messages:', currentMessages.length);
    
    // Check the last few messages for AI responses
    const recentMessages = currentMessages.slice(-3);
    recentMessages.forEach((msg, idx) => {
      console.log(`[VoiceUnifiedMedia] Message ${idx}:`, {
        messageId: msg.messageId,
        isCreatedByUser: msg.isCreatedByUser,
        sender: msg.sender,
        text: msg.text?.substring(0, 50)
      });
    });
    
    // Find the most recent AI message
    const lastAIMessage = currentMessages.filter(msg => !msg.isCreatedByUser).pop();
    if (lastAIMessage && lastAIMessage.messageId !== lastSpokenMessageIdRef.current) {
      console.log('[VoiceUnifiedMedia] Found new AI message to speak');
      setIsWaitingForResponse(false);
      
      if (lastAIMessage.text && isActiveRef.current) {
        console.log('[VoiceUnifiedMedia] Speaking AI response');
        lastSpokenMessageIdRef.current = lastAIMessage.messageId;
        speakText(lastAIMessage.text);
      }
    }
  }, [isActive, isWaitingForResponse, messagesLength, getMessages, speakText]);

  // Monitor for AI responses via latestMessage
  useEffect(() => {
    console.log('[VoiceUnifiedMedia] latestMessage changed:', latestMessage);
    
    if (!isActive || !latestMessage || !isWaitingForResponse) return;
    
    if (!latestMessage.isCreatedByUser) {
      console.log('[VoiceUnifiedMedia] AI response received via latestMessage');
      setIsWaitingForResponse(false);
      
      if (latestMessage.text && isActiveRef.current && latestMessage.messageId !== lastSpokenMessageIdRef.current) {
        console.log('[VoiceUnifiedMedia] Speaking AI response');
        lastSpokenMessageIdRef.current = latestMessage.messageId;
        speakText(latestMessage.text);
      }
    }
  }, [latestMessage, isActive, speakText, isWaitingForResponse]);
  
  // Monitor speech ending
  useEffect(() => {
    if (!isSpeaking && wasSpeakingRef.current) {
      console.log('[VoiceUnifiedMedia] Speech ended');
      wasSpeakingRef.current = false;
      
      // In continuous mode, resume listening after speech ends
      if (isActiveRef.current && modeRef.current === 'continuous' && !isWaitingForResponseRef.current) {
        setTimeout(() => {
          if (isActiveRef.current && !isRecordingRef.current) {
            console.log('[VoiceUnifiedMedia] Resuming after speech ended');
            if (engineSTT === 'browser' && startListeningRef.current) {
              startListeningRef.current();
            } else if (engineSTT === 'external' && startRecordingRef.current) {
              startRecordingRef.current();
            }
          }
        }, 500);
      }
    } else if (isSpeaking && !wasSpeakingRef.current) {
      console.log('[VoiceUnifiedMedia] Speech started');
      wasSpeakingRef.current = true;
    }
  }, [isSpeaking, engineSTT]);
  
  const handleSubmit = useCallback((text: string) => {
    console.log('[VoiceUnifiedMedia] Submitting:', text);
    
    // Use the standard form submission
    methods.setValue('text', text);
    methods.handleSubmit((data) => {
      setIsWaitingForResponse(true);
      submitMessage(data);
    })();
    
    // Clear transcript
    setTranscript({ text: '', isFinal: false });
    setTranscriptState('');
    finalTranscriptRef.current = '';
    
    // In single mode, stop everything
    if (modeRef.current === 'single') {
      setIsActive(false);
      setContinuousMode(false);
      if (engineSTT === 'browser' && stopListeningRef.current) {
        stopListeningRef.current();
      } else if (engineSTT === 'external' && stopRecordingRef.current) {
        stopRecordingRef.current();
      }
    }
  }, [methods, submitMessage, setTranscript, setContinuousMode, engineSTT]);
  
  // Process audio data with actual speech-to-text API
  const processAudioData = useCallback(async (audioBlob: Blob) => {
    console.log('[VoiceUnifiedMedia] Processing audio blob:', {
      size: audioBlob.size,
      type: audioBlob.type,
      sizeKB: (audioBlob.size / 1024).toFixed(2) + ' KB'
    });
    
    // Check if blob is too small (likely silence)
    if (audioBlob.size < 1000) {
      console.warn('[VoiceUnifiedMedia] Audio blob too small, likely silence');
      setIsProcessingAudio(false);
      setTranscript({ text: '', isFinal: false });
      return;
    }
    
    // Show processing status
    setIsProcessingAudio(true);
    setTranscript({ text: '🔄 Processing speech...', isFinal: false });
    
    // Determine file extension based on mime type
    const mimeType = audioBlob.type || 'audio/webm';
    let fileExtension = 'webm';
    if (mimeType.includes('wav')) {
      fileExtension = 'wav';
    } else if (mimeType.includes('mp4')) {
      fileExtension = 'm4a';
    } else if (mimeType.includes('ogg')) {
      fileExtension = 'ogg';
    }
    
    console.log('[VoiceUnifiedMedia] Sending audio to API:', {
      mimeType,
      fileExtension,
      filename: `recording.${fileExtension}`
    });
    
    // Create FormData and send to API
    const formData = new FormData();
    formData.append('audio', audioBlob, `recording.${fileExtension}`);
    
    // Call the mutation
    processAudioMutation(formData);
  }, [setTranscript, processAudioMutation, setIsProcessingAudio]);
  
  // Declare stopRecording before monitorSilence
  const stopRecording = useCallback(() => {
    console.log('[VoiceUnifiedMedia] Stopping recording');
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsRecording(false);
    setListening(false);
  }, [setListening]);

  // Assign to ref
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);
  
  // Monitor silence and stop recording
  const monitorSilence = useCallback(() => {
    if (!analyserRef.current) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let silenceStart = Date.now();
    
    const checkSound = () => {
      if (!analyserRef.current || !isRecordingRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;
      
      if (average > 5) { // Adjust threshold as needed
        silenceStart = Date.now();
        setTranscript({ text: '🎤 Listening...', isFinal: false });
      }
      
      // Stop after 2 seconds of silence
      if (Date.now() - silenceStart > 2000) {
        console.log('[VoiceUnifiedMedia] Silence detected, stopping recording');
        stopRecording();
        return;
      }
      
      animationFrameRef.current = requestAnimationFrame(checkSound);
    };
    
    checkSound();
  }, [setTranscript, stopRecording]);
  
  const startRecording = useCallback(async () => {
    try {
      console.log('[VoiceUnifiedMedia] Starting recording');
      
      // Get microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      // Set up audio context for silence detection
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // Create MediaRecorder with supported mime type
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Try other formats
        const formats = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
        for (const format of formats) {
          if (MediaRecorder.isTypeSupported(format)) {
            mimeType = format;
            break;
          }
        }
      }
      
      console.log('[VoiceUnifiedMedia] Using mime type:', mimeType);
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        console.log('[VoiceUnifiedMedia] Recording stopped');
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        processAudioData(audioBlob);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setListening(true);
      setTranscript({ text: '🎤 Listening...', isFinal: false });
      
      // Start monitoring for silence
      monitorSilence();
      
    } catch (error) {
      console.error('[VoiceUnifiedMedia] Error starting recording:', error);
      showToast({
        message: 'Failed to start recording. Please check microphone permissions.',
        status: 'error',
      });
    }
  }, [setListening, setTranscript, monitorSilence, processAudioData, showToast]);

  // Assign to ref
  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);
  
  // Browser Speech Recognition functions
  const stopListening = useCallback(() => {
    console.log('[VoiceUnifiedMedia] Stopping browser speech recognition');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.log('[VoiceUnifiedMedia] Error aborting recognition:', e);
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setListening(false);
  }, [setListening]);
  
  const startListening = useCallback(() => {
    console.log('[VoiceUnifiedMedia] startListening called');
    
    // Check if we're in a secure context
    if (!window.isSecureContext) {
      console.error('[VoiceUnifiedMedia] Not in secure context. URL:', window.location.href);
      showToast({
        message: 'Speech recognition requires HTTPS or localhost. Current URL: ' + window.location.href,
        status: 'error',
      });
      return;
    }
    
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.error('[VoiceUnifiedMedia] Speech recognition not supported');
      showToast({
        message: 'Speech recognition is not supported in your browser',
        status: 'error',
      });
      return;
    }
    
    // Stop any existing recognition
    if (recognitionRef.current) {
      console.log('[VoiceUnifiedMedia] Stopping existing recognition');
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    console.log('[VoiceUnifiedMedia] Creating new speech recognition');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognitionRef.current = recognition;
    
    recognition.onstart = () => {
      console.log('[VoiceUnifiedMedia] Browser speech recognition started successfully');
      setIsRecording(true);
      setListening(true);
      setTranscript({ text: '🎤 Listening...', isFinal: false });
      setTranscriptState('');
      finalTranscriptRef.current = '';
    };
    
    recognition.onresult = (event: any) => {
      console.log('[VoiceUnifiedMedia] Speech recognition result:', event.results.length, 'results');
      let interimTranscript = '';
      let finalTranscript = finalTranscriptRef.current;
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          console.log('[VoiceUnifiedMedia] Final transcript:', transcript);
        } else {
          interimTranscript += transcript;
          console.log('[VoiceUnifiedMedia] Interim transcript:', transcript);
        }
      }
      
      finalTranscriptRef.current = finalTranscript;
      const fullTranscript = finalTranscript + interimTranscript;
      setTranscriptState(fullTranscript);
      setTranscript({ text: fullTranscript || '🎤 Listening...', isFinal: false });
    };
    
    recognition.onerror = (event: any) => {
      console.error('[VoiceUnifiedMedia] Speech recognition error:', event.error, event);
      let errorMessage = 'Speech recognition error';
      
      if (event.error === 'network') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (event.error === 'not-allowed') {
        errorMessage = 'Microphone permission denied.';
      } else if (event.error === 'no-speech') {
        // This is common and not really an error in continuous mode
        console.log('[VoiceUnifiedMedia] No speech detected, continuing...');
        return;
      } else if (event.error === 'aborted') {
        console.log('[VoiceUnifiedMedia] Speech recognition aborted');
        return;
      }
      
      showToast({ message: errorMessage, status: 'error' });
      stopListening();
    };
    
    recognition.onend = () => {
      console.log('[VoiceUnifiedMedia] Browser speech recognition ended', {
        hasTranscript: !!finalTranscriptRef.current,
        isActive: isActiveRef.current,
        mode: modeRef.current,
        isWaitingForResponse: isWaitingForResponseRef.current
      });
      
      // Submit if we have final transcript
      if (finalTranscriptRef.current.trim()) {
        console.log('[VoiceUnifiedMedia] Submitting final transcript:', finalTranscriptRef.current);
        handleSubmit(finalTranscriptRef.current.trim());
        finalTranscriptRef.current = '';
      }
      
      // Resume in continuous mode
      if (isActiveRef.current && modeRef.current === 'continuous' && !isWaitingForResponseRef.current) {
        console.log('[VoiceUnifiedMedia] Restarting recognition in continuous mode');
        setTimeout(() => {
          if (isActiveRef.current && !isRecordingRef.current && !recognitionRef.current) {
            console.log('[VoiceUnifiedMedia] Restarting recognition from onend');
            // Use a new recognition instance
            try {
              recognition.start();
            } catch (err) {
              console.error('[VoiceUnifiedMedia] Failed to restart:', err);
            }
          }
        }, 500);
      } else {
        setIsRecording(false);
        setListening(false);
        recognitionRef.current = null;
      }
    };
    
    try {
      recognition.start();
      console.log('[VoiceUnifiedMedia] Called recognition.start()');
    } catch (error) {
      console.error('[VoiceUnifiedMedia] Error starting speech recognition:', error);
      showToast({
        message: 'Failed to start speech recognition. Make sure you are accessing the site via HTTPS or localhost.',
        status: 'error',
      });
    }
  }, [setListening, setTranscript, showToast, handleSubmit, setTranscriptState, isRecording]);
  
  // Assign refs
  useEffect(() => {
    startListeningRef.current = startListening;
    stopListeningRef.current = stopListening;
  }, [startListening, stopListening]);
  
  const handleClick = useCallback(async () => {
    if (isActive) {
      // Stop everything
      console.log('[VoiceUnifiedMedia] Stopping voice mode');
      setIsActive(false);
      setContinuousMode(false);
      
      if (engineSTT === 'browser') {
        stopListening();
      } else {
        stopRecording();
      }
      
      lastSpokenMessageIdRef.current = null;
      cancelSpeechLocal();
      finalTranscriptRef.current = '';
      setTranscriptState('');
    } else {
      // Start continuous mode
      console.log('[VoiceUnifiedMedia] Activating continuous mode');
      setMode('continuous');
      setContinuousMode(true);
      setIsActive(true);
      modeRef.current = 'continuous';
      isActiveRef.current = true;
      
      const modeName = engineSTT === 'browser' ? 'Browser Speech Recognition' : 'MediaRecorder';
      showToast({
        message: `Voice mode activated (${modeName}). Speak naturally.`,
        status: 'info',
        duration: 3000,
      });
      
      // Start listening/recording after a delay
      setTimeout(() => {
        console.log('[VoiceUnifiedMedia] Attempting to start listening/recording', {
          isActive: isActiveRef.current,
          engineSTT,
          hasStartListening: !!startListeningRef.current,
          hasStartRecording: !!startRecordingRef.current
        });
        
        if (isActiveRef.current) {
          if (engineSTT === 'browser' && startListeningRef.current) {
            console.log('[VoiceUnifiedMedia] Starting browser speech recognition');
            startListeningRef.current();
          } else if (engineSTT === 'external' && startRecordingRef.current) {
            console.log('[VoiceUnifiedMedia] Starting MediaRecorder');
            startRecordingRef.current();
          }
        }
      }, 500);
    }
  }, [isActive, setContinuousMode, stopRecording, stopListening, showToast, cancelSpeechLocal, engineSTT]);
  
  const getTooltipText = () => {
    if (isActive) return 'Stop voice mode';
    const mode = engineSTT === 'browser' ? 'Browser' : 'External STT';
    return `Click for voice conversation (${mode})`;
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
      if (engineSTT === 'browser') {
        stopListening();
      } else {
        stopRecording();
      }
      cancelSpeechLocal();
    };
  }, [stopRecording, stopListening, cancelSpeechLocal, engineSTT]);
  
  return (
    <TooltipAnchor
      description={getTooltipText()}
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