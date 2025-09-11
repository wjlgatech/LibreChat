// Test to check if speech configuration is loaded
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, 'librechat.yaml');

console.log('Loading librechat.yaml to check speech configuration...\n');

try {
  const fileContents = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(fileContents);
  
  console.log('Configuration loaded successfully!\n');
  
  if (config.speech) {
    console.log('✅ Speech configuration found:');
    console.log(JSON.stringify(config.speech, null, 2));
    
    if (config.speech.tts) {
      console.log('\n✅ TTS configuration:');
      console.log(JSON.stringify(config.speech.tts, null, 2));
      
      if (config.speech.tts.openai) {
        console.log('\n✅ OpenAI TTS configuration:');
        console.log('- url:', config.speech.tts.openai.url || '(empty - will use default)');
        console.log('- apiKey:', config.speech.tts.openai.apiKey);
        console.log('- model:', config.speech.tts.openai.model);
        console.log('- voices:', config.speech.tts.openai.voices);
      }
    } else {
      console.log('\n❌ No TTS configuration found under speech');
    }
  } else {
    console.log('❌ No speech configuration found in librechat.yaml');
  }
  
  // Also check the full config structure
  console.log('\n\nTop-level configuration keys:');
  console.log(Object.keys(config));
  
} catch (error) {
  console.error('Error loading configuration:', error.message);
}