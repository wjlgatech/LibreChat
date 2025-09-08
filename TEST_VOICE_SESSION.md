# Voice Session Testing Steps

## Test Procedure

1. Open browser console to see logs
2. Click the 3rd button (continuous voice) to activate
3. Say something and wait for AI response
4. Check console logs for:
   - Initial conversation ID (should be 'new' or undefined)
   - Conversation ID after first submission
   - Conversation ID on second turn
5. See if conversation ID changes between turns

## Expected Logs

```
[VoiceContinuousFinal] Conversation: {conversationId: undefined/new, ...}
[VoiceContinuousFinal] Submitting: "Hello"
[VoiceContinuousFinal] Conversation at submit: {conversationId: undefined/new, ...}
[VoiceContinuousFinal] Conversation ID updated: actual-id-123
[VoiceContinuousFinal] AI Response detected
[VoiceContinuousFinal] Submitting: "Tell me more"
[VoiceContinuousFinal] Conversation at submit: {conversationId: actual-id-123, ...}
```

## Problem Indicators

- If conversationId stays 'new' or undefined for second turn
- If URL changes to /c/new between turns
- If messages array resets between turns