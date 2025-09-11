// Test to verify TTS configuration is loaded correctly
const axios = require('axios');

async function testTTSConfig() {
  console.log('Testing TTS Configuration\n');
  console.log('========================\n');
  
  try {
    // Test the config endpoint
    console.log('1. Testing TTS config endpoint...');
    const response = await axios.get('http://localhost:3080/api/files/speech/config');
    
    console.log('Response status:', response.status);
    console.log('TTS Configuration:', JSON.stringify(response.data, null, 2));
    
    if (response.data?.tts?.openai) {
      console.log('\n✅ TTS configuration loaded successfully!');
      console.log('Provider: OpenAI');
      console.log('Model:', response.data.tts.openai.model);
      console.log('Voices:', response.data.tts.openai.voices);
    } else {
      console.log('\n❌ TTS configuration not found or invalid');
    }
    
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('❌ Config endpoint not found');
    } else {
      console.log('❌ Error:', error.message);
    }
    console.log('\nMake sure the server is running with the updated librechat.yaml');
  }
}

console.log('Before running this test:');
console.log('1. Save the updated librechat.yaml');
console.log('2. Restart the backend server (Ctrl+C and npm run backend:dev)');
console.log('3. Run: node test-tts-config.js\n');

testTTSConfig();