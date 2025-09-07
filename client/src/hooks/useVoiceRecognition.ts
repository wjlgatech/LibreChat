import { useCallback, useRef, useEffect } from 'react';

// Check for browser speech recognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useVoiceRecognition() {
  const recognitionRef = useRef<any>(null);

  const checkMicrophonePermission = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log('[VoiceRecognition] Microphone permission status:', result.state);
      return result.state;
    } catch (error) {
      console.log('[VoiceRecognition] Permission query not supported, trying getUserMedia');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return 'granted';
      } catch (e) {
        return 'denied';
      }
    }
  };

  const createRecognition = useCallback(() => {
    if (!SpeechRecognition) {
      console.error('[VoiceRecognition] Speech recognition not supported');
      return null;
    }

    try {
      const recognition = new SpeechRecognition();
      console.log('[VoiceRecognition] Created recognition instance:', recognition);
      return recognition;
    } catch (error) {
      console.error('[VoiceRecognition] Failed to create recognition:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore errors during cleanup
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    SpeechRecognition,
    hasSpeechRecognition: !!SpeechRecognition,
    createRecognition,
    checkMicrophonePermission,
    recognitionRef,
  };
}