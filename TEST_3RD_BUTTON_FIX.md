# 3rd Button Auto-Off Fix

## Problem
The 3rd button (continuous conversation) was turning off automatically after submitting the first message.

## Root Cause
In the `onresult` handler, after submitting a message, the code was calling:
```javascript
recognitionRef.current.abort();
recognitionRef.current = null;
```

This was stopping the recognition completely, causing the button to appear inactive.

## Fix Applied
1. Removed the `abort()` call after submission - just clear the transcript
2. Added `isActiveRef` to track active state properly in closures
3. Updated `onend` handler to restart recognition if still active
4. Updated all checks to use `isActiveRef.current` instead of stale `isActive`

## Key Changes
- Line 89: Changed from aborting recognition to just clearing transcript
- Lines 34-39: Added `isActiveRef` and sync effect
- Lines 107-120: Updated `onend` to use ref and restart if active
- Lines 140-147: Updated resume logic to use ref

## Expected Behavior
Now the 3rd button should:
1. Stay active after submitting text
2. Continue listening for next input
3. Only turn off when explicitly clicked