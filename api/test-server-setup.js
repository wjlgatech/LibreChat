// Quick test to check server setup
const path = require('path');

console.log('=== Server Setup Test ===\n');

// Test module resolution
try {
  console.log('1. Testing module resolution...');
  const { getAppConfig } = require('./server/services/Config');
  console.log('✅ Config module resolved');
} catch (error) {
  console.error('❌ Config module error:', error.message);
}

// Test TTS service
try {
  console.log('\n2. Testing TTS service...');
  const { streamAudio } = require('./server/services/Files/Audio');
  console.log('✅ TTS service module resolved');
  console.log('   streamAudio type:', typeof streamAudio);
} catch (error) {
  console.error('❌ TTS service error:', error.message);
}

// Test environment
console.log('\n3. Environment check:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('   Working directory:', process.cwd());

// Test config file
const fs = require('fs');
const yaml = require('yaml');

console.log('\n4. Config file check:');
try {
  const configPath = path.join(__dirname, '..', 'librechat.yaml');
  const configExists = fs.existsSync(configPath);
  console.log('   librechat.yaml exists:', configExists);
  
  if (configExists) {
    const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('   Has speech config:', !!config.speech);
    console.log('   Has TTS config:', !!config.speech?.tts);
    if (config.speech?.tts) {
      console.log('   TTS providers:', Object.keys(config.speech.tts));
    }
  }
} catch (error) {
  console.error('❌ Config file error:', error.message);
}

console.log('\n5. API key check:');
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const hasTTSKey = envContent.includes('TTS_API_KEY=');
    const hasOpenAIKey = envContent.includes('OPENAI_API_KEY=');
    console.log('   Has TTS_API_KEY:', hasTTSKey);
    console.log('   Has OPENAI_API_KEY:', hasOpenAIKey);
  } else {
    console.log('   .env file not found');
  }
} catch (error) {
  console.error('❌ Env file error:', error.message);
}