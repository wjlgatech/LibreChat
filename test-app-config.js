// Test what AppService loads
require('dotenv').config();
const path = require('path');

// Set up environment
process.env.CONFIG_PATH = process.env.CONFIG_PATH || path.resolve(__dirname, 'librechat.yaml');

async function testAppConfig() {
  try {
    console.log('Testing AppService configuration loading...\n');
    
    // Import after environment is set
    const { getAppConfig } = require('./api/server/services/AppService');
    
    console.log('Loading app configuration...');
    const config = await getAppConfig();
    
    console.log('\nConfiguration loaded!');
    console.log('Has speech config:', !!config?.speech);
    console.log('Has TTS config:', !!config?.speech?.tts);
    
    if (config?.speech) {
      console.log('\n✅ Speech configuration in AppService:');
      console.log(JSON.stringify(config.speech, null, 2));
    } else {
      console.log('\n❌ No speech configuration found in AppService');
      
      // Log what keys are present
      console.log('\nKeys in config:');
      console.log(Object.keys(config || {}));
    }
    
    // Force exit since we're not in a proper server context
    process.exit(0);
    
  } catch (error) {
    console.error('Error testing AppService:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testAppConfig();