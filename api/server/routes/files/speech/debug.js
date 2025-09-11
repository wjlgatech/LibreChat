const express = require('express');
const router = express.Router();

// Debug endpoint to test auth
router.get('/test-auth', (req, res) => {
  res.json({
    hasUser: !!req.user,
    userId: req.user?.id,
    userRole: req.user?.role,
    headers: {
      hasAuth: !!req.headers.authorization,
      authType: req.headers.authorization?.split(' ')[0],
    },
  });
});

// Debug endpoint to test TTS config
router.get('/test-config', async (req, res) => {
  try {
    const { getAppConfig } = require('~/server/services/Config');
    const appConfig = await getAppConfig({ role: req.user?.role });
    
    res.json({
      hasSpeechConfig: !!appConfig?.speech,
      hasTTSConfig: !!appConfig?.speech?.tts,
      providers: appConfig?.speech?.tts ? Object.keys(appConfig.speech.tts) : [],
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

module.exports = router;