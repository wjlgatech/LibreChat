const axios = require('axios');

async function testTTSBackend() {
  console.log('=== Testing TTS Backend Directly ===\n');
  
  // First, we need to get a valid token
  // This assumes you're already logged in and have a session
  console.log('1. Make sure you are logged into LibreChat in your browser');
  console.log('2. Open browser DevTools and run: ');
  console.log('   localStorage.getItem("token")');
  console.log('3. Copy the token (without quotes) and paste it below:\n');
  
  // For testing, we'll use a hardcoded token
  // In real usage, you'd get this from the browser
  const token = process.env.LIBRECHAT_TOKEN || 'YOUR_TOKEN_HERE';
  
  if (token === 'YOUR_TOKEN_HERE') {
    console.log('Please set LIBRECHAT_TOKEN environment variable with your auth token');
    console.log('Example: LIBRECHAT_TOKEN=your_token_here node test-tts-backend.js');
    return;
  }
  
  const testPayload = {
    messageId: 'test-message-123',
    runId: 'test-run-456',
    voice: 'alloy',
  };
  
  try {
    console.log('\nMaking TTS request to backend...');
    console.log('Payload:', testPayload);
    
    const response = await axios.post(
      'http://localhost:3090/api/files/speech/tts',
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    
    console.log('\nSuccess! Response status:', response.status);
    console.log('Response headers:', response.headers);
    
  } catch (error) {
    console.error('\nError calling TTS endpoint:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Response Data:', error.response.data);
      console.error('Response Headers:', error.response.headers);
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testTTSBackend().catch(console.error);