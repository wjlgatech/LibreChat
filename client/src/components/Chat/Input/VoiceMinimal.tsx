import { useState } from 'react';

// Minimal voice component to test speech recognition
export default function VoiceMinimal() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log('[VoiceMinimal]', msg);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  const startRecognition = () => {
    addLog('Starting recognition...');
    setError('');
    setTranscript('');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech recognition not supported');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      addLog('Recognition configured');
      
      recognition.onstart = () => {
        addLog('Recognition started');
        setIsListening(true);
      };
      
      recognition.onaudiostart = () => {
        addLog('Audio capture started');
      };
      
      recognition.onsoundstart = () => {
        addLog('Sound detected');
      };
      
      recognition.onspeechstart = () => {
        addLog('Speech detected');
      };
      
      recognition.onresult = (event: any) => {
        addLog(`Result received: ${event.results.length} results`);
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        
        setTranscript(finalTranscript + interimTranscript);
      };
      
      recognition.onerror = (event: any) => {
        addLog(`Error: ${event.error}`);
        setError(`Error: ${event.error}`);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        addLog('Recognition ended');
        setIsListening(false);
      };
      
      // Store reference to stop later
      (window as any).testRecognition = recognition;
      
      // Start immediately without delay
      recognition.start();
      addLog('start() called');
      
    } catch (e: any) {
      addLog(`Exception: ${e.message}`);
      setError(`Exception: ${e.message}`);
    }
  };

  const stopRecognition = () => {
    addLog('Stopping recognition...');
    if ((window as any).testRecognition) {
      (window as any).testRecognition.stop();
      (window as any).testRecognition = null;
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '20px' }}>
      <h3>Minimal Voice Test</h3>
      
      <div>
        <button onClick={startRecognition} disabled={isListening}>
          Start Recognition
        </button>
        <button onClick={stopRecognition} disabled={!isListening}>
          Stop Recognition
        </button>
        <button onClick={() => { setLogs([]); setTranscript(''); setError(''); }}>
          Clear
        </button>
      </div>
      
      <div style={{ marginTop: '10px' }}>
        <strong>Status:</strong> {isListening ? '🟢 Listening' : '⚪ Not listening'}
      </div>
      
      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {transcript && (
        <div style={{ marginTop: '10px' }}>
          <strong>Transcript:</strong> {transcript}
        </div>
      )}
      
      <div style={{ marginTop: '20px' }}>
        <strong>Logs:</strong>
        <div style={{ fontSize: '12px', fontFamily: 'monospace', maxHeight: '200px', overflow: 'auto' }}>
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
}