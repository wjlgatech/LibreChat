const multer = require('multer');
const express = require('express');
const { CacheKeys } = require('librechat-data-provider');
const { getVoices, streamAudio, textToSpeech } = require('~/server/services/Files/Audio');
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');

const router = express.Router();
const upload = multer();

router.post('/manual', upload.none(), async (req, res) => {
  await textToSpeech(req, res);
});

const logDebugMessage = (req, message) =>
  logger.debug(`[streamAudio] user: ${req?.user?.id ?? 'UNDEFINED_USER'} | ${message}`);

// TODO: test caching
router.post('/', async (req, res) => {
  try {
    console.log('[TTS Route] Request received:', {
      hasUser: !!req.user,
      userId: req.user?.id,
      userName: req.user?.username,
      userKeys: req.user ? Object.keys(req.user) : [],
      authHeader: req.headers.authorization ? req.headers.authorization.substring(0, 30) + '...' : 'none',
      hasCookies: !!req.headers.cookie,
      messageId: req.body.messageId,
      runId: req.body.runId,
      voice: req.body.voice,
    });
    
    if (!req.user?.id) {
      logger.error('[TTS Route] User not authenticated - Details:', {
        hasUser: !!req.user,
        userObject: req.user,
        headers: {
          authorization: req.headers.authorization ? 'present' : 'missing',
          cookie: req.headers.cookie ? 'present' : 'missing',
          contentType: req.headers['content-type']
        }
      });
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const audioRunsCache = getLogStores(CacheKeys.AUDIO_RUNS);
    const audioRun = await audioRunsCache.get(req.body.runId);
    logDebugMessage(req, 'start stream audio');
    if (audioRun) {
      logDebugMessage(req, 'stream audio already running');
      return res.status(401).json({ error: 'Audio stream already running' });
    }
    audioRunsCache.set(req.body.runId, true);
    
    // streamAudio handles the response, don't call res.end() here
    await streamAudio(req, res);
    logDebugMessage(req, 'end stream audio');
  } catch (error) {
    logger.error(`[streamAudio] user: ${req.user?.id ?? 'UNDEFINED'} | Failed to stream audio:`, error);
    console.error('[streamAudio] Full error:', error);
    console.error('[streamAudio] Error stack:', error.stack);
    
    // Clean up the audio run cache on error
    if (req.body.runId) {
      const audioRunsCache = getLogStores(CacheKeys.AUDIO_RUNS);
      audioRunsCache.delete(req.body.runId);
    }
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio', details: error.message });
    }
  }
});

router.get('/voices', async (req, res) => {
  await getVoices(req, res);
});

module.exports = router;
