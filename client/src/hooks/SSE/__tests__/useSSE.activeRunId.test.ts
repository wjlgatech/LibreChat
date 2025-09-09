import { v4 } from 'uuid';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-run-id-123'),
}));

// Mock Recoil hooks - this will track when setActiveRunId is called
let mockSetActiveRunId = jest.fn();

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: (atom: any) => {
    if (atom?.key?.includes?.('activeRun')) {
      return mockSetActiveRunId;
    }
    return jest.fn();
  },
  useRecoilValue: () => null,
  useRecoilState: () => [null, jest.fn()],
}));

// Mock SSE.js
const mockEventListeners = new Map();
const mockSSE = {
  addEventListener: jest.fn((event: string, handler: Function) => {
    mockEventListeners.set(event, handler);
  }),
  stream: jest.fn(),
  close: jest.fn(),
  readyState: 1,
};

jest.mock('sse.js', () => ({
  SSE: jest.fn(() => mockSSE),
}));

// Mock other dependencies
jest.mock('librechat-data-provider', () => ({
  createPayload: jest.fn((submission) => ({
    server: '/api/chat',
    payload: submission,
  })),
  removeNullishValues: jest.fn((obj) => obj),
  LocalStorageKeys: {
    TEXT_DRAFT: 'textDraft',
    FILES_DRAFT: 'filesDraft',
  },
  Constants: {
    NEW_CONVO: 'new',
  },
}));

jest.mock('~/data-provider', () => ({
  useGenTitleMutation: () => ({ mutate: jest.fn() }),
  useGetStartupConfig: () => ({ data: null }),
  useGetUserBalance: () => ({ refetch: jest.fn() }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ token: 'test-token', isAuthenticated: true }),
}));

jest.mock('../useEventHandlers', () => ({
  __esModule: true,
  default: () => ({
    clearStepMaps: jest.fn(),
    stepHandler: jest.fn(),
    syncHandler: jest.fn(),
    finalHandler: jest.fn(),
    errorHandler: jest.fn(),
    messageHandler: jest.fn(),
    contentHandler: jest.fn(),
    createdHandler: jest.fn(),
    attachmentHandler: jest.fn(),
    abortConversation: jest.fn(),
  }),
}));

// Import after mocking
import useSSE from '../useSSE';

describe('useSSE - activeRunId setting', () => {
  const mockSubmission = {
    userMessage: {
      messageId: 'user-msg-1',
      text: 'Hello',
      conversationId: 'conv-1',
    },
    conversation: {
      conversationId: 'conv-1',
    },
    initialResponse: {
      messageId: 'ai-msg-1',
    },
  };

  const mockChatHelpers = {
    setMessages: jest.fn(),
    getMessages: jest.fn(() => []),
    setConversation: jest.fn(),
    setIsSubmitting: jest.fn(),
    newConversation: jest.fn(),
    resetLatestMessage: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventListeners.clear();
    mockSetActiveRunId = jest.fn();
  });

  it('should set activeRunId when SSE event with created property is received', () => {
    // Initialize the hook (this will set up SSE listeners)
    useSSE(mockSubmission, mockChatHelpers, false, 0);

    // Verify SSE was set up
    expect(mockSSE.stream).toHaveBeenCalled();
    expect(mockEventListeners.has('message')).toBe(true);

    // Get the message handler
    const messageHandler = mockEventListeners.get('message');
    expect(messageHandler).toBeDefined();

    // Simulate SSE event with created property
    const sseEventData = {
      created: Date.now(),
      message: {
        messageId: 'ai-msg-1',
        text: 'Hello! How can I help you?',
        isCreatedByUser: false,
      },
    };

    // Trigger the SSE event
    messageHandler({ data: JSON.stringify(sseEventData) });

    // Verify activeRunId was set with a UUID
    expect(v4).toHaveBeenCalled();
    expect(mockSetActiveRunId).toHaveBeenCalledWith('test-run-id-123');
  });

  it('should set activeRunId when SSE event with sync property is received', () => {
    useSSE(mockSubmission, mockChatHelpers, false, 0);

    const messageHandler = mockEventListeners.get('message');
    const sseEventData = {
      sync: true,
      messages: [],
    };

    messageHandler({ data: JSON.stringify(sseEventData) });

    expect(v4).toHaveBeenCalled();
    expect(mockSetActiveRunId).toHaveBeenCalledWith('test-run-id-123');
  });

  it('should NOT set activeRunId for other SSE event types', () => {
    useSSE(mockSubmission, mockChatHelpers, false, 0);

    const messageHandler = mockEventListeners.get('message');

    // Test various event types that should NOT set activeRunId
    const eventsWithoutActiveRunId = [
      { final: true },
      { event: 'step' },
      { type: 'content', text: 'Some text' },
      { text: 'Regular message' },
    ];

    for (const eventData of eventsWithoutActiveRunId) {
      messageHandler({ data: JSON.stringify(eventData) });
    }

    // activeRunId should not have been called
    expect(mockSetActiveRunId).not.toHaveBeenCalled();
  });

  it('should generate unique activeRunId for multiple runs', () => {
    const mockV4 = require('uuid').v4;
    mockV4
      .mockReturnValueOnce('run-id-1')
      .mockReturnValueOnce('run-id-2');

    useSSE(mockSubmission, mockChatHelpers, false, 0);
    const messageHandler = mockEventListeners.get('message');

    // First run - created event
    messageHandler({ 
      data: JSON.stringify({ 
        created: Date.now(), 
        message: { messageId: 'msg-1' } 
      }) 
    });

    expect(mockSetActiveRunId).toHaveBeenCalledWith('run-id-1');

    // Second run - sync event
    messageHandler({ 
      data: JSON.stringify({ 
        sync: true,
        messages: [] 
      }) 
    });

    expect(mockSetActiveRunId).toHaveBeenCalledWith('run-id-2');

    // Verify both run IDs were set in order
    expect(mockSetActiveRunId).toHaveBeenCalledTimes(2);
    expect(mockSetActiveRunId).toHaveBeenNthCalledWith(1, 'run-id-1');
    expect(mockSetActiveRunId).toHaveBeenNthCalledWith(2, 'run-id-2');
  });

  it('should fail: activeRunId is not being set correctly (current bug)', () => {
    // This test demonstrates the current bug where activeRunId stays null
    // In the actual broken implementation, setActiveRunId is never called
    
    // Mock the broken behavior - don't call setActiveRunId
    mockSetActiveRunId = jest.fn();
    
    useSSE(mockSubmission, mockChatHelpers, false, 0);
    const messageHandler = mockEventListeners.get('message');

    // Simulate the events that should set activeRunId
    messageHandler({ 
      data: JSON.stringify({ 
        created: Date.now(), 
        message: { messageId: 'msg-1' } 
      }) 
    });

    // This test will PASS when the bug is fixed
    // Currently it should FAIL because activeRunId is not being set
    expect(mockSetActiveRunId).toHaveBeenCalledWith('test-run-id-123');
  });
});