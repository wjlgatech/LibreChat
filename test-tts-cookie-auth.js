// Test TTS with cookie-based authentication
// This simulates how the browser sends requests

async function testTTSWithCookies() {
  console.log('Testing TTS with cookie authentication...\n');
  
  // Step 1: Login to get cookies
  console.log('1. Logging in to get authentication cookies...');
  
  try {
    // You need to replace these with valid credentials
    const loginResponse = await fetch('http://localhost:3090/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'your-email@example.com', // Replace with your email
        password: 'your-password' // Replace with your password
      })
    });
    
    if (!loginResponse.ok) {
      console.error('Login failed:', loginResponse.status);
      console.log('\nPlease update this script with valid credentials.');
      return;
    }
    
    // Extract cookies from response
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('Login successful!');
    console.log('Cookies received:', cookies ? 'Yes' : 'No');
    
    // Get token from response
    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('Token received:', token ? 'Yes' : 'No');
    
    // Step 2: Test TTS with cookies
    console.log('\n2. Testing TTS endpoint with cookies...');
    
    // Create a fake message ID for testing
    const testPayload = {
      messageId: 'test-message-' + Date.now(),
      runId: 'test-run-' + Date.now(),
      voice: 'alloy'
    };
    
    console.log('Test payload:', testPayload);
    
    // Test with cookies (browser-style)
    const ttsResponse = await fetch('http://localhost:3090/api/files/speech/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || ''
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('\nTTS Response:');
    console.log('- Status:', ttsResponse.status);
    console.log('- Status Text:', ttsResponse.statusText);
    console.log('- Headers:', Object.fromEntries(ttsResponse.headers.entries()));
    
    if (!ttsResponse.ok) {
      const errorBody = await ttsResponse.text();
      console.log('- Error Body:', errorBody);
    }
    
    // Also test with Bearer token
    console.log('\n3. Testing TTS endpoint with Bearer token...');
    const ttsBearerResponse = await fetch('http://localhost:3090/api/files/speech/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('\nTTS Bearer Response:');
    console.log('- Status:', ttsBearerResponse.status);
    console.log('- Status Text:', ttsBearerResponse.statusText);
    
    if (!ttsBearerResponse.ok) {
      const errorBody = await ttsBearerResponse.text();
      console.log('- Error Body:', errorBody);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }
}

// Instructions
console.log('Cookie-based TTS Authentication Test');
console.log('====================================\n');
console.log('This test simulates browser-style authentication using cookies.\n');
console.log('Before running:');
console.log('1. Make sure the server is running: npm run backend:dev');
console.log('2. Update the email and password in this script');
console.log('3. Run: node test-tts-cookie-auth.js\n');

// Uncomment to run the test
// testTTSWithCookies();

console.log('Uncomment the last line to run the test.');