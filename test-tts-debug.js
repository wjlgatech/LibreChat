// TTS Debug Script
// This script tests various aspects of the TTS functionality

const mongoose = require('mongoose');
require('dotenv').config();

async function testTTS() {
  console.log('=== TTS DEBUG TEST ===\n');
  
  // 1. Check environment variables
  console.log('1. Environment Variables:');
  console.log('   - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Missing');
  console.log('   - TTS_API_KEY:', process.env.TTS_API_KEY ? '✓ Set' : '✗ Missing');
  console.log('   - JWT_SECRET:', process.env.JWT_SECRET ? '✓ Set' : '✗ Missing');
  console.log('   - MONGO_URI:', process.env.MONGO_URI ? '✓ Set' : '✗ Missing');
  
  // 2. Check configuration
  console.log('\n2. Configuration:');
  try {
    const { getAppConfig } = require('./api/server/services/Config');
    const appConfig = await getAppConfig({});
    console.log('   - App config loaded:', !!appConfig ? '✓' : '✗');
    console.log('   - Speech config:', !!appConfig?.speech ? '✓' : '✗');
    console.log('   - TTS config:', !!appConfig?.speech?.tts ? '✓' : '✗');
    if (appConfig?.speech?.tts) {
      const providers = Object.keys(appConfig.speech.tts);
      console.log('   - TTS providers:', providers.join(', '));
      providers.forEach(provider => {
        const config = appConfig.speech.tts[provider];
        console.log(`   - ${provider} config:`, {
          hasApiKey: !!config.apiKey,
          model: config.model,
          voices: config.voices?.length || 0
        });
      });
    }
  } catch (error) {
    console.error('   ✗ Error loading config:', error.message);
  }
  
  // 3. Test TTS Service
  console.log('\n3. TTS Service Test:');
  try {
    const { getProvider, textToSpeech, streamAudio } = require('./api/server/services/Files/Audio/TTSService');
    console.log('   - TTS Service loaded:', '✓');
    
    // Test provider detection
    const { getAppConfig } = require('./api/server/services/Config');
    const appConfig = await getAppConfig({});
    const provider = await getProvider(appConfig);
    console.log('   - Detected provider:', provider);
  } catch (error) {
    console.error('   ✗ Error with TTS Service:', error.message);
  }
  
  // 4. Test direct OpenAI API call
  console.log('\n4. Direct OpenAI API Test:');
  const apiKey = process.env.TTS_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const axios = require('axios');
      const response = await axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model: 'tts-1',
          voice: 'alloy',
          input: 'Hello, this is a test.'
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );
      console.log('   ✓ OpenAI API call successful');
      console.log('   - Response size:', response.data.length, 'bytes');
    } catch (error) {
      console.error('   ✗ OpenAI API call failed:', error.response?.data || error.message);
    }
  } else {
    console.log('   ✗ No API key available');
  }
  
  // 5. Test message retrieval
  console.log('\n5. Message Retrieval Test:');
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('   ✓ Connected to MongoDB');
    
    const { getMessage } = require('./api/models/Message');
    
    // Get a recent message
    const Message = mongoose.model('Message');
    const recentMessage = await Message.findOne({ isCreatedByUser: false })
      .sort({ createdAt: -1 })
      .limit(1);
      
    if (recentMessage) {
      console.log('   ✓ Found recent message:', {
        messageId: recentMessage.messageId,
        hasText: !!recentMessage.text,
        hasContent: !!recentMessage.content,
        textLength: recentMessage.text?.length || 0
      });
      
      // Test getMessage function
      const retrieved = await getMessage({ messageId: recentMessage.messageId });
      console.log('   - getMessage result:', !!retrieved ? '✓ Found' : '✗ Not found');
      
      if (retrieved) {
        // Test text extraction
        const { parseTextParts } = require('librechat-data-provider');
        const text = retrieved.content?.length > 0 ? parseTextParts(retrieved.content) : retrieved.text;
        console.log('   - Extracted text length:', text?.length || 0);
      }
    } else {
      console.log('   ✗ No messages found in database');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('   ✗ Error with message retrieval:', error.message);
  }
  
  console.log('\n=== END OF TEST ===');
}

// Run the test
testTTS().catch(console.error);