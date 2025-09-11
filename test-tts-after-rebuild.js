const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Read session cookie from file
const cookiePath = path.join(__dirname, 'test_session_cookie.txt');
const sessionCookie = fs.readFileSync(cookiePath, 'utf8').trim();

async function testTTS() {
  try {
    console.log('Testing TTS endpoint after rebuild...\n');
    
    const response = await axios.post(
      'http://localhost:3080/api/files/speech/stream-audio',
      {
        messageId: 'test-message-' + Date.now(),
        runId: 'test-run-' + Date.now(),
        text: 'Hello! This is a test of the text to speech functionality after the rebuild.',
        voice: 'alloy',
        provider: 'openai',
        model: 'tts-1',
        stream: true
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': sessionCookie
        },
        responseType: 'stream'
      }
    );

    console.log('✅ TTS request successful!');
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    // Just test if we get a response, don't save the audio
    let bytesReceived = 0;
    response.data.on('data', (chunk) => {
      bytesReceived += chunk.length;
    });
    
    response.data.on('end', () => {
      console.log('\n✅ Stream completed successfully');
      console.log('Total bytes received:', bytesReceived);
    });
    
    response.data.on('error', (err) => {
      console.error('Stream error:', err);
    });
    
  } catch (error) {
    console.error('\n❌ TTS request failed:');
    console.error('Error status:', error.response?.status);
    console.error('Error message:', error.response?.data || error.message);
    
    if (error.response?.data) {
      console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testTTS();