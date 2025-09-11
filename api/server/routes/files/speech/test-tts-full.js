const express = require('express');
const router = express.Router();

// Full test endpoint that simulates a complete TTS request
router.post('/test-full', async (req, res) => {
  console.log('\n=== FULL TTS TEST ===');
  console.log('Time:', new Date().toISOString());
  console.log('\n1. Authentication:');
  console.log('   User ID:', req.user?.id || 'NO USER');
  console.log('   Username:', req.user?.username || 'NO USERNAME');
  console.log('   Has auth header:', !!req.headers.authorization);
  
  console.log('\n2. Request Body:');
  console.log('   Message ID:', req.body.messageId);
  console.log('   Run ID:', req.body.runId);
  console.log('   Voice:', req.body.voice);
  
  console.log('\n3. Configuration Test:');
  try {
    const { getAppConfig } = require('~/server/services/Config');
    const appConfig = await getAppConfig({ role: req.user?.role });
    console.log('   Config loaded:', !!appConfig);
    console.log('   Has speech:', !!appConfig?.speech);
    console.log('   Has TTS:', !!appConfig?.speech?.tts);
    console.log('   Providers:', appConfig?.speech?.tts ? Object.keys(appConfig.speech.tts) : []);
  } catch (error) {
    console.error('   Config error:', error.message);
  }
  
  console.log('\n4. Message Lookup Test:');
  if (req.body.messageId) {
    try {
      const { getMessage } = require('~/models/Message');
      const message = await getMessage({ 
        messageId: req.body.messageId,
        user: req.user?.id
      });
      console.log('   Message found:', !!message);
      if (message) {
        console.log('   Has text:', !!message.text);
        console.log('   Text length:', message.text?.length || 0);
        console.log('   Has content:', !!message.content);
      }
      
      // Also try without user filter
      if (!message) {
        const messageNoUser = await getMessage({ messageId: req.body.messageId });
        console.log('   Message found (no user filter):', !!messageNoUser);
      }
    } catch (error) {
      console.error('   Message lookup error:', error.message);
    }
  }
  
  console.log('\n5. TTS Service Test:');
  try {
    const TTSService = require('~/server/services/Files/Audio/TTSService');
    console.log('   TTS Service available:', !!TTSService);
    
    // Try to get provider
    const { getProvider } = TTSService;
    const { getAppConfig } = require('~/server/services/Config');
    const appConfig = await getAppConfig({ role: req.user?.role });
    const provider = await getProvider(appConfig);
    console.log('   Provider:', provider);
  } catch (error) {
    console.error('   TTS Service error:', error.message);
  }
  
  console.log('\n=== END TEST ===\n');
  
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    user: req.user ? {
      id: req.user.id,
      username: req.user.username
    } : null,
    request: {
      messageId: req.body.messageId,
      runId: req.body.runId,
      voice: req.body.voice
    }
  });
});

module.exports = router;