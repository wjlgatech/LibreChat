# Fix for Conversation Continuity in Voice Chat

## Problem Analysis

Each conversational turn creates a new session because:

1. When `conversationId` is `Constants.NEW_CONVO`, the `ask` function in `useChatFunctions.ts`:
   - Sets `conversationId = null`
   - Clears `currentMessages = []` 
   - Navigates to `/c/new`

2. The continuous voice component doesn't track the conversation ID after it's created

## Solution

We need to:
1. Track when a conversation ID is assigned after the first message
2. Use that conversation ID for subsequent messages
3. Ensure we're not resetting the conversation context

## Implementation Steps

1. Monitor the conversation object for when it gets a real ID
2. Store that ID and use it for subsequent submissions
3. Ensure the continuous voice mode maintains the conversation context