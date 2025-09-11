// Simple test to see what's happening with TTS

const testTTS = async () => {
  console.log('Testing TTS endpoint...\n');
  
  // First, let's test if the server is running
  try {
    const healthResponse = await fetch('http://localhost:3090/health');
    console.log('Server health check:', healthResponse.ok ? 'OK' : 'Failed');
  } catch (error) {
    console.error('Server not running or not accessible');
    return;
  }
  
  // Get token from your browser console:
  // 1. Open LibreChat in browser
  // 2. Open DevTools Console
  // 3. Run: copy(localStorage.getItem('token'))
  // 4. Paste here:
  
  const token = 'YOUR_TOKEN_HERE'; // Replace with your actual token
  
  if (token === 'YOUR_TOKEN_HERE') {
    console.log('\nPlease get your auth token from browser console:');
    console.log('1. Open LibreChat in browser');
    console.log('2. Open DevTools Console (F12)');
    console.log('3. Run: copy(localStorage.getItem("token"))');
    console.log('4. Replace YOUR_TOKEN_HERE with the copied token');
    return;
  }
  
  console.log('\nTesting TTS endpoint with token...');
  
  try {
    const response = await fetch('http://localhost:3090/api/files/speech/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        messageId: 'test-message-123',
        runId: 'test-run-456',
        voice: 'alloy'
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('Response body:', text);
    
    // Try to parse as JSON if possible
    try {
      const json = JSON.parse(text);
      console.log('Parsed response:', JSON.stringify(json, null, 2));
    } catch {
      console.log('Response is not JSON');
    }
    
  } catch (error) {
    console.error('Error calling TTS:', error);
  }
};

// Check if we're running in Node.js
if (typeof window === 'undefined') {
  testTTS();
} else {
  console.log('Run this script with Node.js: node test-tts-simple.js');
}