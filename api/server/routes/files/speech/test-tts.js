const express = require('express');
const router = express.Router();

// Test endpoint to debug auth and TTS
router.get('/test', (req, res) => {
  console.log('[TTS Test] Request received');
  console.log('[TTS Test] req.user:', req.user);
  console.log('[TTS Test] Headers:', {
    authorization: req.headers.authorization ? 'Present' : 'Missing',
    contentType: req.headers['content-type'],
  });
  
  res.json({
    success: true,
    user: req.user ? {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    } : null,
    headers: {
      hasAuth: !!req.headers.authorization,
    },
    timestamp: new Date().toISOString(),
  });
});

// Test TTS config
router.get('/test-config', async (req, res) => {
  try {
    const { getAppConfig } = require('~/server/services/Config');
    const appConfig = await getAppConfig({ role: req.user?.role });
    
    console.log('[TTS Test Config] appConfig:', {
      hasSpeech: !!appConfig?.speech,
      hasTTS: !!appConfig?.speech?.tts,
      providers: appConfig?.speech?.tts ? Object.keys(appConfig.speech.tts) : [],
    });
    
    res.json({
      success: true,
      config: {
        hasSpeech: !!appConfig?.speech,
        hasTTS: !!appConfig?.speech?.tts,
        providers: appConfig?.speech?.tts ? Object.keys(appConfig.speech.tts) : [],
        ttsConfig: appConfig?.speech?.tts,
      },
    });
  } catch (error) {
    console.error('[TTS Test Config] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

module.exports = router;