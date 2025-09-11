const express = require('express');
const { createTTSLimiters, createSTTLimiters } = require('~/server/middleware');

const stt = require('./stt');
const tts = require('./tts');
const testTts = require('./test-tts');
const testTtsFull = require('./test-tts-full');
const customConfigSpeech = require('./customConfigSpeech');

const router = express.Router();

const { sttIpLimiter, sttUserLimiter } = createSTTLimiters();
const { ttsIpLimiter, ttsUserLimiter } = createTTSLimiters();
router.use('/stt', sttIpLimiter, sttUserLimiter, stt);
router.use('/tts', ttsIpLimiter, ttsUserLimiter, tts);
router.use('/test-tts', testTts);
router.use('/test-tts-full', testTtsFull);

router.use('/config', customConfigSpeech);

module.exports = router;
