# Manual Test for VoiceChatContinuousFinal TTS Integration

## Test Setup
1. Ensure backend server is running: `npm run backend:dev`
2. Access LibreChat at http://localhost:3080
3. Enable TTS in settings (gear icon → Speech → Text-to-Speech toggle)
4. Select a voice from the dropdown if available

## Test Steps

### Test 1: Verify Automatic TTS Activation
1. Click the continuous voice button (wave icon)
2. Speak a question (e.g., "What is the weather today?")
3. Wait for transcription and submission
4. **Expected**: AI response should automatically play as audio through TTS
5. Click the button again to deactivate
6. **Expected**: Audio should stop playing

### Test 2: Verify Streaming TTS
1. Click the continuous voice button
2. Ask a question that generates a long response (e.g., "Tell me a story about a dragon")
3. **Expected**: TTS should start playing before the full response is generated
4. **Expected**: Audio should stream in real-time as text is generated

### Test 3: Multi-turn Conversation with TTS
1. Click the continuous voice button
2. Have a multi-turn conversation:
   - User: "Hello"
   - AI: (response plays automatically)
   - User: "What's your name?"
   - AI: (response plays automatically)
3. **Expected**: Each AI response plays automatically via TTS
4. **Expected**: Voice recognition resumes after each TTS playback

### Test 4: TTS Settings Persistence
1. Enable continuous voice mode
2. Navigate to a different conversation
3. Return to the original conversation
4. **Expected**: TTS should NOT be automatically enabled
5. Click continuous voice button again
6. **Expected**: TTS should be re-enabled for new responses

## Technical Verification
- Check browser console for:
  - `[VoiceContinuousFinal] Activating continuous mode`
  - `[VoiceContinuousFinal] AI Response detected`
  - StreamAudio logs showing audio fetching
- Check Network tab for `/api/files/speech/tts` requests
- Verify MediaSource API is being used for streaming (if supported)