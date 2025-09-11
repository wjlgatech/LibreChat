// Comprehensive TTS Authentication Test
// This test checks the entire authentication flow

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3090';
const TEST_CREDENTIALS = {
  email: 'test@example.com',  // Replace with your email
  password: 'password123'      // Replace with your password
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function comprehensiveTTSTest() {
  console.log('Comprehensive TTS Authentication Test');
  console.log('=====================================\n');
  
  try {
    // Step 1: Test server health
    console.log('1. Testing server health...');
    try {
      const healthResponse = await axios.get(`${BASE_URL}/api/health`);
      console.log('✅ Server is running:', healthResponse.data);
    } catch (error) {
      console.log('❌ Server health check failed:', error.message);
      console.log('Make sure the server is running with: npm run backend:dev');
      return;
    }
    
    // Step 2: Login to get JWT token
    console.log('\n2. Logging in to get JWT token...');
    let token;
    try {
      const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, TEST_CREDENTIALS);
      token = loginResponse.data.token;
      console.log('✅ Login successful!');
      console.log('Token received:', token ? `${token.substring(0, 50)}...` : 'None');
      console.log('User:', loginResponse.data.user?.username || 'Unknown');
    } catch (error) {
      console.log('❌ Login failed:', error.response?.data || error.message);
      console.log('\nPlease update TEST_CREDENTIALS in this script with valid credentials.');
      return;
    }
    
    // Step 3: Test authenticated endpoint
    console.log('\n3. Testing authenticated endpoint...');
    try {
      const userResponse = await axios.get(`${BASE_URL}/api/user`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('✅ Authentication working! User data:', userResponse.data);
    } catch (error) {
      console.log('❌ Authentication test failed:', error.response?.status, error.response?.data);
    }
    
    // Step 4: Test TTS configuration endpoint
    console.log('\n4. Testing TTS configuration...');
    try {
      const configResponse = await axios.get(`${BASE_URL}/api/files/speech/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('✅ TTS config retrieved:', JSON.stringify(configResponse.data, null, 2));
    } catch (error) {
      console.log('❌ TTS config failed:', error.response?.status, error.response?.data);
    }
    
    // Step 5: Get a real message to test TTS
    console.log('\n5. Getting recent messages for TTS test...');
    let messageId, conversationId;
    try {
      const convosResponse = await axios.get(`${BASE_URL}/api/convos?pageNumber=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (convosResponse.data.conversations?.length > 0) {
        conversationId = convosResponse.data.conversations[0].conversationId;
        console.log('Found conversation:', conversationId);
        
        const messagesResponse = await axios.get(`${BASE_URL}/api/messages/${conversationId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const assistantMessage = messagesResponse.data.find(m => 
          m.isCreatedByUser === false && m.text && m.text.length > 10
        );
        
        if (assistantMessage) {
          messageId = assistantMessage.messageId;
          console.log('✅ Found assistant message:', {
            messageId,
            preview: assistantMessage.text.substring(0, 50) + '...'
          });
        }
      }
    } catch (error) {
      console.log('⚠️  Could not get messages:', error.message);
    }
    
    // Step 6: Test TTS endpoint with fake message (should fail gracefully)
    console.log('\n6. Testing TTS endpoint with fake message ID...');
    const fakeRunId = `test-run-${Date.now()}`;
    const fakeMessageId = `test-message-${Date.now()}`;
    
    try {
      console.log('Request payload:', {
        messageId: fakeMessageId,
        runId: fakeRunId,
        voice: 'alloy'
      });
      
      const ttsResponse = await axios.post(`${BASE_URL}/api/files/speech/tts`, {
        messageId: fakeMessageId,
        runId: fakeRunId,
        voice: 'alloy'
      }, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        // Don't throw on 4xx/5xx to see the error response
        validateStatus: () => true
      });
      
      console.log('Response status:', ttsResponse.status);
      console.log('Response headers:', ttsResponse.headers);
      
      if (ttsResponse.status === 401) {
        console.log('❌ Authentication failed at TTS endpoint');
        console.log('Error:', ttsResponse.data);
      } else if (ttsResponse.status === 500) {
        console.log('⚠️  Expected: Message not found error');
        console.log('Response:', ttsResponse.data);
      } else if (ttsResponse.status === 200) {
        console.log('✅ TTS endpoint accepted request (unexpected for fake message)');
      }
    } catch (error) {
      console.log('❌ TTS request failed:', error.message);
    }
    
    // Step 7: Test TTS with real message (if found)
    if (messageId) {
      console.log('\n7. Testing TTS endpoint with real message...');
      const realRunId = `test-run-${Date.now()}`;
      
      try {
        const ttsResponse = await axios.post(`${BASE_URL}/api/files/speech/tts`, {
          messageId: messageId,
          runId: realRunId,
          voice: 'alloy'
        }, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          validateStatus: () => true
        });
        
        console.log('Response status:', ttsResponse.status);
        
        if (ttsResponse.status === 200) {
          console.log('✅ TTS request successful!');
          console.log('Content-Type:', ttsResponse.headers['content-type']);
          // Don't actually consume the stream, just verify it works
          ttsResponse.data.destroy();
        } else {
          console.log('❌ TTS failed with status:', ttsResponse.status);
          // Convert stream to text for error message
          let errorText = '';
          for await (const chunk of ttsResponse.data) {
            errorText += chunk.toString();
          }
          console.log('Error:', errorText);
        }
      } catch (error) {
        console.log('❌ TTS request failed:', error.message);
      }
    }
    
    console.log('\n\nTest Summary');
    console.log('============');
    console.log('If authentication is failing at the TTS endpoint:');
    console.log('1. Check server logs for enhanced authentication logging');
    console.log('2. Verify JWT_SECRET matches in .env file');
    console.log('3. Check if requireJwtAuth middleware is running before TTS route');
    console.log('4. Look for any passport strategy errors in server logs');
    
  } catch (error) {
    console.error('\nTest suite failed:', error.message);
  }
}

// Run the test
comprehensiveTTSTest();