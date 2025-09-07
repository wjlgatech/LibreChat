import { useState, useRef } from 'react';

// Check for browser speech recognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasSpeechRecognition = !!SpeechRecognition;

export default function VoiceTestSimple() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const startListening = () => {
    console.log('[VoiceTest] Starting...');
    
    if (!hasSpeechRecognition) {
      console.error('[VoiceTest] No speech recognition support');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        console.log('[VoiceTest] Started');
        setIsListening(true);
      };
      
      recognition.onresult = (event: any) => {
        console.log('[VoiceTest] Result:', event);
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');
        setTranscript(transcript);
      };
      
      recognition.onerror = (event: any) => {
        console.error('[VoiceTest] Error:', event.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        console.log('[VoiceTest] Ended');
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
      recognition.start();
      console.log('[VoiceTest] Start called');
    } catch (error) {
      console.error('[VoiceTest] Failed:', error);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  return (
    <div style={{ padding: 20, border: '1px solid #ccc', margin: 10 }}>
      <h3>Simple Voice Test</h3>
      <button onClick={isListening ? stopListening : startListening}>
        {isListening ? 'Stop' : 'Start'} Listening
      </button>
      <p>Status: {isListening ? 'Listening...' : 'Not listening'}</p>
      <p>Transcript: {transcript}</p>
    </div>
  );
}