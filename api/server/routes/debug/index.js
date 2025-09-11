const express = require('express');
const { serverLogCapture } = require('~/server/utils/serverLogCapture');

const router = express.Router();

// Only enable in development/debug mode
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGS === 'true') {
  
  // Start log capture
  router.post('/logs/start', (req, res) => {
    serverLogCapture.start();
    res.json({ 
      status: 'started', 
      capturing: true,
      message: 'Server log capture started'
    });
  });

  // Stop log capture
  router.post('/logs/stop', (req, res) => {
    serverLogCapture.stop();
    res.json({ 
      status: 'stopped', 
      capturing: false,
      message: 'Server log capture stopped'
    });
  });

  // Get logs
  router.get('/logs', (req, res) => {
    const options = {
      type: req.query.type,
      contains: req.query.contains,
      last: req.query.last ? parseInt(req.query.last) : undefined,
    };

    const logs = serverLogCapture.getLogs(options);
    res.json({
      logs,
      capturing: serverLogCapture.capturing,
      total: logs.length,
    });
  });

  // Get TTS-specific logs
  router.get('/logs/tts', (req, res) => {
    const logs = serverLogCapture.getTTSLogs();
    res.json({
      logs,
      capturing: serverLogCapture.capturing,
      total: logs.length,
    });
  });

  // Get StreamAudio-specific logs
  router.get('/logs/streamaudio', (req, res) => {
    const logs = serverLogCapture.getStreamAudioLogs();
    res.json({
      logs,
      capturing: serverLogCapture.capturing,
      total: logs.length,
    });
  });

  // Clear logs
  router.delete('/logs', (req, res) => {
    serverLogCapture.clear();
    res.json({ 
      status: 'cleared',
      message: 'Server logs cleared'
    });
  });

  // Get current status
  router.get('/logs/status', (req, res) => {
    res.json({
      capturing: serverLogCapture.capturing,
      logCount: serverLogCapture.logs.length,
      maxLogs: serverLogCapture.maxLogs,
    });
  });

  // Server-Sent Events endpoint for real-time logs
  router.get('/logs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendLog = (logEntry) => {
      res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
    };

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to log stream' })}\n\n`);

    // Listen for new logs
    serverLogCapture.on('log', sendLog);

    // Clean up on disconnect
    req.on('close', () => {
      serverLogCapture.removeListener('log', sendLog);
    });
  });

} else {
  // In production, return 404 for all debug endpoints
  router.use((req, res) => {
    res.status(404).json({ error: 'Debug endpoints not available in production' });
  });
}

module.exports = router;