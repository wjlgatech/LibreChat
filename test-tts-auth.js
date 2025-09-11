// Instructions to get auth token:
// 1. Open LibreChat in your browser and log in
// 2. Open Developer Console (F12)
// 3. Go to Application/Storage tab > Local Storage > http://localhost:3090
// 4. Find the 'token' key and copy its value
// 5. Replace 'YOUR_AUTH_TOKEN' below with the actual token

const AUTH_TOKEN = 'YOUR_AUTH_TOKEN'; // Replace this!

async function testTTSWithAuth() {
  if (AUTH_TOKEN === 'YOUR_AUTH_TOKEN') {
    console.log('Please follow these steps to get your auth token:');
    console.log('1. Open LibreChat in your browser and log in');
    console.log('2. Open Developer Console (F12)');
    console.log('3. Go to Application/Storage tab > Local Storage > http://localhost:3090');
    console.log('4. Find the "token" key and copy its value');
    console.log('5. Replace YOUR_AUTH_TOKEN in this file with the actual token');
    return;
  }

  console.log('Testing TTS with authentication...\n');

  // Test auth endpoint
  console.log('1. Testing authentication...');
  try {
    const authResponse = await fetch('http://localhost:3090/api/files/speech/test-tts/test', {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    if (authResponse.status === 401) {
      console.error('Authentication failed! Token may be invalid or expired.');
      return;
    }
    
    const authData = await authResponse.json();
    console.log('Auth successful! User:', authData.user);
    
  } catch (error) {
    console.error('Auth test failed:', error);
    return;
  }

  // Test TTS config
  console.log('\n2. Testing TTS configuration...');
  try {
    const configResponse = await fetch('http://localhost:3090/api/files/speech/test-tts/test-config', {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const configData = await configResponse.json();
    console.log('TTS Config:', JSON.stringify(configData, null, 2));
    
  } catch (error) {
    console.error('Config test failed:', error);
  }

  // Get a recent message to test TTS
  console.log('\n3. Getting recent messages...');
  try {
    const convosResponse = await fetch('http://localhost:3090/api/convos?pageNumber=1', {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const convosData = await convosResponse.json();
    if (convosData.conversations && convosData.conversations.length > 0) {
      const conversationId = convosData.conversations[0].conversationId;
      console.log('Found conversation:', conversationId);
      
      // Get messages from this conversation
      const messagesResponse = await fetch(`http://localhost:3090/api/messages/${conversationId}`, {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      });
      
      const messages = await messagesResponse.json();
      const assistantMessage = messages.find(m => m.isCreatedByUser === false && m.text && m.text.length > 10);
      
      if (assistantMessage) {
        console.log('Found assistant message:', {
          messageId: assistantMessage.messageId,
          text: assistantMessage.text.substring(0, 50) + '...'
        });
        
        // Test TTS
        console.log('\n4. Testing TTS endpoint...');
        const ttsResponse = await fetch('http://localhost:3090/api/files/speech/tts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messageId: assistantMessage.messageId,
            runId: `test-${Date.now()}`,
            voice: 'alloy'
          })
        });
        
        console.log('TTS Response status:', ttsResponse.status);
        console.log('Response headers:', Object.fromEntries(ttsResponse.headers.entries()));
        
        if (ttsResponse.status === 200) {
          console.log('✓ TTS endpoint returned 200 OK');
          const contentType = ttsResponse.headers.get('content-type');
          if (contentType === 'audio/mpeg') {
            console.log('✓ Correct content type received');
          }
        } else {
          const errorText = await ttsResponse.text();
          console.error('TTS failed:', errorText);
        }
      }
    }
  } catch (error) {
    console.error('Message test failed:', error);
  }
}

// Run the test
testTTSWithAuth();