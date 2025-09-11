// Final TTS Test - Complete flow with authentication
const axios = require('axios');

const BASE_URL = 'http://localhost:3080';  // Note: Server is on 3080, not 3090

async function finalTTSTest() {
  console.log('LibreChat TTS Final Test');
  console.log('========================\n');
  
  try {
    // Step 1: Skip health check and go straight to login
    console.log('1. Server should be running on port 3080');
    
    // Step 2: Login
    console.log('\n2. Logging in...');
    const loginData = {
      email: 'test@example.com',  // Replace with your email
      password: 'password123'      // Replace with your password
    };
    
    let token;
    try {
      const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, loginData);
      token = loginResponse.data.token;
      console.log('✅ Login successful!');
    } catch (error) {
      console.log('❌ Login failed:', error.response?.data || error.message);
      console.log('\nPlease update the email and password in this script');
      return;
    }
    
    // Step 3: Test a simple authenticated request
    console.log('\n3. Testing authentication...');
    try {
      const userResponse = await axios.get(`${BASE_URL}/api/user`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('✅ Authentication working! User:', userResponse.data.username);
    } catch (error) {
      console.log('❌ Authentication test failed');
    }
    
    // Step 4: Test TTS with a fake message
    console.log('\n4. Testing TTS endpoint...');
    const ttsPayload = {
      messageId: `test-msg-${Date.now()}`,
      runId: `test-run-${Date.now()}`,
      voice: 'alloy'
    };
    
    try {
      const ttsResponse = await axios.post(`${BASE_URL}/api/files/speech/tts`, ttsPayload, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        validateStatus: () => true  // Don't throw on 4xx/5xx
      });
      
      console.log('Response status:', ttsResponse.status);
      
      if (ttsResponse.status === 500) {
        const errorData = ttsResponse.data;
        console.log('Error response:', errorData);
        
        if (errorData.error?.includes('No TTS schema')) {
          console.log('\n❌ TTS configuration not loaded!');
          console.log('The librechat.yaml file may not have been reloaded.');
          console.log('Try restarting the server completely.');
        } else if (errorData.error?.includes('Message not found')) {
          console.log('\n✅ TTS is configured! (Got expected "Message not found" error)');
          console.log('The TTS endpoint is working correctly!');
        }
      } else if (ttsResponse.status === 200) {
        console.log('\n✅ TTS request successful!');
      }
    } catch (error) {
      console.log('❌ TTS request failed:', error.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

console.log('Make sure to update the login credentials in this script!\n');
finalTTSTest();