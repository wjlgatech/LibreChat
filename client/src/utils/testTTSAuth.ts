// Simple TTS authentication test that can be run from the browser console

export async function testTTSAuth() {
  console.log('=== TTS AUTH TEST ===');
  
  const token = localStorage.getItem('token');
  if (!token) {
    console.error('❌ No auth token found. Please log in first.');
    return;
  }
  
  console.log('✓ Auth token found');
  
  // Step 1: Test authentication
  console.log('\n1. Testing authentication...');
  try {
    const authResponse = await fetch('/api/files/speech/test-tts/test', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!authResponse.ok) {
      console.error('❌ Authentication failed:', authResponse.status);
      return;
    }
    
    const authData = await authResponse.json();
    console.log('✓ Authentication successful');
    console.log('  User ID:', authData.user?.id);
    console.log('  Username:', authData.user?.username);
  } catch (error) {
    console.error('❌ Auth test failed:', error);
    return;
  }
  
  // Step 2: Test TTS config
  console.log('\n2. Testing TTS configuration...');
  try {
    const configResponse = await fetch('/api/files/speech/test-tts/test-config', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const configData = await configResponse.json();
    console.log('✓ Config loaded');
    console.log('  Has TTS:', configData.config?.hasTTS);
    console.log('  Providers:', configData.config?.providers);
  } catch (error) {
    console.error('❌ Config test failed:', error);
  }
  
  // Step 3: Get a recent message for testing
  console.log('\n3. Finding a message to test with...');
  let testMessageId = null;
  
  try {
    // Get active conversation ID
    const conversationId = window.location.pathname.split('/c/')[1];
    if (conversationId) {
      console.log('  Conversation ID:', conversationId);
      
      // Get messages from the conversation
      const messagesResponse = await fetch(`/api/messages/${conversationId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (messagesResponse.ok) {
        const messages = await messagesResponse.json();
        const assistantMessage = messages.find((m: any) => 
          m.isCreatedByUser === false && 
          m.text && 
          m.text.length > 10
        );
        
        if (assistantMessage) {
          testMessageId = assistantMessage.messageId;
          console.log('✓ Found assistant message:', testMessageId);
          console.log('  Text preview:', assistantMessage.text.substring(0, 50) + '...');
        }
      }
    }
  } catch (error) {
    console.error('❌ Message search failed:', error);
  }
  
  // Step 4: Test TTS with a message
  if (testMessageId) {
    console.log('\n4. Testing TTS endpoint...');
    const runId = `test-${Date.now()}`;
    
    try {
      console.log('  Request payload:', {
        messageId: testMessageId,
        runId: runId,
        voice: 'alloy'
      });
      
      const ttsResponse = await fetch('/api/files/speech/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messageId: testMessageId,
          runId: runId,
          voice: 'alloy'
        })
      });
      
      console.log('  Response status:', ttsResponse.status);
      console.log('  Content-Type:', ttsResponse.headers.get('content-type'));
      
      if (ttsResponse.ok) {
        console.log('✓ TTS request successful!');
        
        // Check if we got audio data
        const blob = await ttsResponse.blob();
        console.log('  Audio size:', blob.size, 'bytes');
        console.log('  Audio type:', blob.type);
        
        // Play a sample
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        console.log('✓ Audio object created. Call audio.play() to test playback.');
        (window as any).testAudio = audio;
      } else {
        const errorText = await ttsResponse.text();
        console.error('❌ TTS request failed:', errorText);
      }
    } catch (error) {
      console.error('❌ TTS test failed:', error);
    }
  } else {
    console.log('\n4. Skipping TTS test - no message found');
    console.log('   Try sending a message to the AI first, then run this test again.');
  }
  
  console.log('\n=== END OF TEST ===');
  console.log('\nIf audio was created, you can play it with: window.testAudio.play()');
}

// Simpler test function for quick debugging
export async function testTTSSimple() {
  console.log('=== SIMPLE TTS TEST ===');
  
  const token = localStorage.getItem('token');
  const authContext = (window as any).__authContext;
  
  console.log('Token from localStorage:', token ? 'Found' : 'Not found');
  console.log('Token from auth context:', authContext?.token ? 'Found' : 'Not available');
  
  // Try to get token from axios defaults
  try {
    const axiosAuth = (window as any).axios?.defaults?.headers?.common?.Authorization;
    console.log('Axios default auth header:', axiosAuth || 'Not set');
  } catch (e) {
    console.log('Could not check axios defaults');
  }
  
  // Test the full endpoint
  const actualToken = token || authContext?.token;
  if (!actualToken) {
    console.error('No token available for testing');
    return;
  }
  
  console.log('\nTesting full TTS endpoint...');
  try {
    const response = await fetch('/api/files/speech/test-tts-full/test-full', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${actualToken}`
      },
      body: JSON.stringify({
        messageId: 'test-message-123',
        runId: 'test-run-456',
        voice: 'alloy'
      })
    });
    
    const data = await response.json();
    console.log('Response:', data);
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  console.log('\n=== END TEST ===');
}

// Make it available globally
(window as any).testTTSAuth = testTTSAuth;
(window as any).testTTSSimple = testTTSSimple;

// Store auth context reference for debugging
if ((window as any).React) {
  const originalCreateElement = (window as any).React.createElement;
  (window as any).React.createElement = function(...args: any[]) {
    const element = originalCreateElement.apply(this, args);
    // Intercept AuthContext.Provider
    if (element && element.type && element.type._context && element.props && element.props.value && element.props.value.token) {
      (window as any).__authContext = element.props.value;
    }
    return element;
  };
}

console.log('TTS Auth Test loaded. Run with: window.testTTSAuth() or window.testTTSSimple()');

export default testTTSAuth;