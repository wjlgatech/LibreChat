# TTS Service - Voice AI

## Overview

The TTS (Text-to-Speech) Service is a standalone microservice extracted from LibreChat, designed for ultra-low latency voice synthesis in the Voice AI platform. It supports multiple TTS providers and streaming capabilities for real-time applications.

## Features

- 🎯 **Multi-Provider Support**: OpenAI, Azure OpenAI, ElevenLabs, LocalAI
- 🚀 **Streaming Support**: Real-time audio streaming for low latency
- 📦 **Text Chunking**: Automatic splitting of long texts at natural boundaries
- 🔊 **Voice Selection**: Dynamic voice selection with fallback defaults
- ⚡ **WebRTC Ready**: Designed for integration with MediaSoup
- 🔧 **TypeScript**: Full type safety and modern async/await patterns

## Architecture

```
Client Request
    ↓
TTS Route (/api/tts/*)
    ↓
TTSService
    ↓
Provider Strategy (OpenAI/ElevenLabs/etc)
    ↓
Audio Stream Response
```

## API Endpoints

### GET /api/tts/voices
Get available voices for the configured provider.

**Response:**
```json
{
  "provider": "openai",
  "voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
}
```

### POST /api/tts/synthesize
Synthesize speech from text.

**Request Body:**
```json
{
  "text": "Hello, this is a test",
  "voice": "alloy"  // optional
}
```

**Response:** Audio stream (audio/mpeg)

### POST /api/tts/stream
Stream TTS for real-time applications (designed for WebRTC integration).

**Request Body:**
```json
{
  "messageId": "msg_123",  // or
  "text": "Direct text input",
  "voice": "alloy"  // optional
}
```

**Response:** Chunked audio stream

### POST /api/tts/chunk
Process a single text chunk (for custom streaming implementations).

**Request Body:**
```json
{
  "text": "Text chunk",
  "voice": "alloy",
  "isLast": false
}
```

**Response:** Audio chunk with metadata

### GET /api/tts/health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "provider": "openai",
  "hasApiKey": true
}
```

## Configuration

Configure the service through environment variables:

```env
# TTS Provider Selection
TTS_PROVIDER=openai  # openai, azureOpenAI, elevenlabs, localai

# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_TTS_MODEL=tts-1  # or tts-1-hd
OPENAI_VOICES=alloy,echo,fable,onyx,nova,shimmer
OPENAI_DEFAULT_VOICE=alloy

# ElevenLabs Configuration (optional)
ELEVENLABS_API_KEY=your-key
ELEVENLABS_MODEL=eleven_monolingual_v1
ELEVENLABS_VOICES=voice-id-1,voice-id-2
ELEVENLABS_DEFAULT_VOICE=voice-id-1

# Azure OpenAI Configuration (optional)
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_INSTANCE_NAME=your-instance
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment
AZURE_OPENAI_API_VERSION=2024-02-01
```

## Integration with Voice AI

### WebRTC Audio Pipeline

```typescript
// Example: Integrating TTS with MediaSoup
async function handleTextToSpeech(text: string, webrtcProducer: Producer) {
  // 1. Call TTS service
  const response = await fetch('http://localhost:3000/api/tts/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: 'alloy' })
  });
  
  // 2. Convert audio stream to WebRTC format
  const audioStream = response.body;
  // ... WebRTC audio processing
  
  // 3. Send through MediaSoup
  webrtcProducer.send(audioData);
}
```

### Streaming Architecture

For <700ms latency, the service supports:
1. **Chunked Processing**: Text is split at sentence boundaries
2. **Parallel Synthesis**: Multiple chunks can be processed simultaneously
3. **Stream Concatenation**: Audio chunks are streamed as they're ready

## Performance Optimization

### Latency Breakdown
- API Request: ~10-20ms
- TTS Processing: ~100-150ms (OpenAI tts-1)
- Network Transfer: ~20-50ms
- **Total**: ~130-220ms per chunk

### Best Practices
1. Use `tts-1` model for lower latency (vs `tts-1-hd`)
2. Keep text chunks under 1000 characters
3. Pre-warm the service with a health check
4. Use connection pooling for API requests

## Testing

Use the provided test client:
```bash
# Start the server
npm run dev

# Open test client
open http://localhost:3000/test-tts.html
```

## Error Handling

The service includes comprehensive error handling:
- Provider API failures with retry logic
- Invalid voice selection with fallback
- Network timeouts with circuit breaker pattern
- Stream interruption recovery

## Security Considerations

1. **API Key Protection**: Never expose API keys to client
2. **Rate Limiting**: Implement per-user rate limits
3. **Input Validation**: Sanitize text input
4. **CORS**: Configure allowed origins properly

## Future Enhancements

1. **Caching Layer**: Redis cache for repeated phrases
2. **Voice Cloning**: Support for custom voices
3. **Multi-language**: Automatic language detection
4. **Audio Post-processing**: Noise reduction, normalization
5. **WebSocket Support**: Direct WebSocket streaming

## Troubleshooting

### Common Issues

**No audio output**
- Check API key configuration
- Verify provider is correctly set
- Check network connectivity to provider API

**High latency**
- Switch to `tts-1` model (OpenAI)
- Reduce text chunk size
- Check network latency to provider

**Voice not available**
- Verify voice exists for provider
- Check VOICES environment variable
- Use default voice as fallback

## Contributing

When adding new providers:
1. Implement provider strategy in `TTSService.ts`
2. Add configuration interface
3. Update environment variables
4. Add provider to enum
5. Test with all endpoints

## License

MIT License - Part of Voice AI Project