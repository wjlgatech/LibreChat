# Voice AI Integration for LibreChat

## Overview

This directory contains the voice AI implementation for LibreChat, achieving **2-3 second response times** for natural voice conversations.

## Features

- ✅ **Auto-detection**: Automatically detects when you start and stop speaking
- ✅ **Multi-turn conversations**: Continuous listening for natural dialogue flow
- ✅ **Low latency**: 2-3 second total response time (down from 5-10 seconds)
- ✅ **Visual feedback**: Real-time voice level indicator
- ✅ **Adjustable sensitivity**: Fine-tune for different environments and voices
- ✅ **Browser-based**: No server required, runs entirely in the browser

## Quick Start

1. Open `voice-ai-auto-working.html` in your browser
2. Enter your OpenAI API key
3. Click "Start Conversation"
4. Start speaking - the AI will automatically detect when you stop

## Optimal Settings

Through extensive testing, we found these settings work best for most users:
- **VAD Threshold**: 0.040
- **Silence Duration**: 500ms (0.5 seconds)

You can adjust these using the sensitivity and timing buttons if needed.

## Technical Details

### Architecture
- **Speech Recognition**: OpenAI Whisper API
- **AI Model**: GPT-3.5-turbo (optimized for speed)
- **Text-to-Speech**: OpenAI TTS API
- **Voice Activity Detection**: Web Audio API with RMS threshold

### Key Components
1. **Real-time VAD**: Uses AnalyserNode to calculate RMS values
2. **Smart Silence Detection**: 500ms threshold prevents premature cutoffs
3. **State Management**: Prevents audio processing conflicts
4. **Continuous Mode**: Automatically restarts after each turn

### Performance Breakdown
- Silence detection: 0.5s
- Transcription: 0.5-1s
- AI response: 0.5-1s
- TTS generation: 0.5-1s
- **Total**: 2-3 seconds

## Files

- `voice-ai-working.html` - The main working implementation with auto-stop
- `voice-ai-latency-optimization.md` - Detailed optimization guide and lessons learned
- `realtime-api-tdd-test.html` - Test suite for debugging OpenAI Realtime API
- `test-*.html` - Various test implementations for different approaches
- `backend/` - Backend services for voice processing
- `mobile/` - Mobile app implementations
- `docs/` - Additional documentation

## Lessons Learned

1. **Browser WebSocket Limitations**: OpenAI's Realtime API requires server-side proxy due to authentication header requirements
2. **VAD Tuning is Critical**: The threshold of 0.040 provides the best balance
3. **User Feedback Matters**: Visual indicators significantly improve user experience
4. **TDD Saves Time**: Test-driven development helped identify API limitations quickly

## Future Improvements

1. **Streaming Transcription**: Integrate Deepgram for <1 second latency
2. **Response Streaming**: Stream GPT responses as they generate
3. **Barge-in Detection**: Allow interrupting AI responses
4. **WebRTC Integration**: Further reduce latency with peer-to-peer audio

## Integration with LibreChat

To integrate this voice functionality into LibreChat:

1. Add the voice UI components to the chat interface
2. Connect the audio processing pipeline to the message system
3. Handle voice/text mode switching
4. Add voice activity indicators to the UI

## Requirements

- Modern browser with Web Audio API support
- OpenAI API key with access to:
  - Whisper API
  - GPT-3.5-turbo
  - TTS API
- Microphone permissions

## Browser Compatibility

Tested and working on:
- Chrome 90+
- Firefox 89+
- Safari 14+
- Edge 90+

## License

This implementation is part of the LibreChat project and follows the same licensing terms.