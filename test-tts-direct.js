const axios = require('axios');
const fs = require('fs');
const yaml = require('yaml');

async function testTTSConfiguration() {
  console.log('=== TTS Configuration Test ===\n');
  
  // 1. Check librechat.yaml
  console.log('1. Checking librechat.yaml configuration...');
  try {
    const configContent = fs.readFileSync('./librechat.yaml', 'utf8');
    const config = yaml.parse(configContent);
    
    console.log('- Speech config exists:', !!config.speech);
    console.log('- TTS config exists:', !!config.speech?.tts);
    console.log('- OpenAI TTS config exists:', !!config.speech?.tts?.openai);
    console.log('- TTS model:', config.speech?.tts?.openai?.model);
    console.log('- TTS voices:', config.speech?.tts?.openai?.voices);
    console.log('- TTS apiKey reference:', config.speech?.tts?.openai?.apiKey);
  } catch (error) {
    console.error('Error reading librechat.yaml:', error.message);
  }
  
  // 2. Check .env
  console.log('\n2. Checking .env configuration...');
  try {
    const envContent = fs.readFileSync('./.env', 'utf8');
    const ttsKeyLine = envContent.split('\n').find(line => line.startsWith('TTS_API_KEY='));
    const openaiKeyLine = envContent.split('\n').find(line => line.startsWith('OPENAI_API_KEY='));
    
    console.log('- TTS_API_KEY line found:', !!ttsKeyLine);
    console.log('- OPENAI_API_KEY line found:', !!openaiKeyLine);
    
    if (ttsKeyLine) {
      const ttsKey = ttsKeyLine.split('=')[1].trim();
      console.log('- TTS_API_KEY starts with:', ttsKey.substring(0, 7));
      console.log('- TTS_API_KEY length:', ttsKey.length);
    }
    
    if (openaiKeyLine) {
      const openaiKey = openaiKeyLine.split('=')[1].trim();
      console.log('- OPENAI_API_KEY starts with:', openaiKey.substring(0, 7));
      console.log('- OPENAI_API_KEY length:', openaiKey.length);
    }
  } catch (error) {
    console.error('Error reading .env:', error.message);
  }
  
  // 3. Test direct API call
  console.log('\n3. Testing OpenAI TTS API directly...');
  try {
    const envContent = fs.readFileSync('./.env', 'utf8');
    const ttsKeyLine = envContent.split('\n').find(line => line.startsWith('TTS_API_KEY='));
    const apiKey = ttsKeyLine.split('=')[1].trim();
    
    console.log('Making API request to OpenAI TTS...');
    const response = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      {
        model: 'tts-1',
        input: 'Hello, this is a test.',
        voice: 'alloy',
        response_format: 'mp3'
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );
    
    console.log('- Response status:', response.status);
    console.log('- Response headers:', Object.keys(response.headers).join(', '));
    console.log('- Audio data size:', response.data.length, 'bytes');
    
    // Save the audio file for verification
    fs.writeFileSync('./test-tts-output.mp3', response.data);
    console.log('- Audio saved to test-tts-output.mp3');
    
  } catch (error) {
    console.error('Error calling TTS API:', error.message);
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Status text:', error.response.statusText);
      console.error('- Error data:', error.response.data);
    }
  }
  
  // 4. Check how env vars are loaded in the app
  console.log('\n4. Checking environment variable loading...');
  require('dotenv').config({ path: './.env' });
  console.log('- process.env.TTS_API_KEY exists:', !!process.env.TTS_API_KEY);
  console.log('- process.env.TTS_API_KEY starts with:', process.env.TTS_API_KEY?.substring(0, 7));
  
  // 5. Test the extractEnvVariable function
  console.log('\n5. Testing environment variable extraction...');
  try {
    const { extractEnvVariable } = require('librechat-data-provider');
    const extracted = extractEnvVariable('${TTS_API_KEY}');
    console.log('- extractEnvVariable result exists:', !!extracted);
    console.log('- extractEnvVariable result starts with:', extracted?.substring(0, 7));
  } catch (error) {
    console.error('Error testing extractEnvVariable:', error.message);
  }
}

testTTSConfiguration().catch(console.error);