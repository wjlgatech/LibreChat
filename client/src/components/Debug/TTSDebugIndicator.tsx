import React, { useEffect, useState } from 'react';

const TTSDebugIndicator: React.FC = () => {
  const [isDebugging, setIsDebugging] = useState(false);
  const [debugStatus, setDebugStatus] = useState('');

  useEffect(() => {
    // Check debug status every second
    const interval = setInterval(() => {
      const debugActive = (window as any).ttsDebugActive || false;
      setIsDebugging(debugActive);
      
      if (debugActive) {
        setDebugStatus('Recording TTS debug data...');
      } else if ((window as any).ttsDebug?.getLastDebugData) {
        const lastData = (window as any).ttsDebug.getLastDebugData();
        if (lastData?.analysis?.apiCalls?.length > 0) {
          setDebugStatus('Debug data available in clipboard');
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!isDebugging && !debugStatus) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: isDebugging ? '#ef4444' : '#10b981',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 'bold',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        animation: isDebugging ? 'pulse 2s infinite' : 'none',
      }}
    >
      {isDebugging && (
        <div
          style={{
            width: '12px',
            height: '12px',
            backgroundColor: 'white',
            borderRadius: '50%',
            animation: 'pulse 1s infinite',
          }}
        />
      )}
      {debugStatus}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default TTSDebugIndicator;