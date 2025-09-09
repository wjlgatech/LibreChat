import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import MultiMessage from '../../Messages/MultiMessage';

// Mock the nested MultiMessage component
jest.mock('../../Messages/Message', () => {
  return {
    __esModule: true,
    default: ({ message }: any) => (
      <div data-testid={`message-${message.messageId}`} data-message-owner={message.isCreatedByUser ? 'user' : 'ai'}>
        {message.text}
      </div>
    ),
  };
});

// Mock SiblingSwitch to check if navigation is shown
jest.mock('../../Messages/SiblingSwitch', () => {
  return {
    __esModule: true,
    default: ({ siblingIdx, siblingCount }: any) => (
      <div data-testid="sibling-switch">
        <button aria-label="Previous">&lt;</button>
        <span>{siblingIdx + 1} / {siblingCount}</span>
        <button aria-label="Next">&gt;</button>
      </div>
    ),
  };
});

// Mock messages that would be stacked
const mockMessages = [
  {
    messageId: 'msg-1',
    conversationId: 'test-conversation-id',
    text: 'Hello, how can I help you?',
    isCreatedByUser: false,
    createdAt: new Date('2025-01-09T10:00:00').toISOString(),
  },
  {
    messageId: 'msg-2',
    conversationId: 'test-conversation-id',
    text: 'What is the weather like?',
    isCreatedByUser: true,
    createdAt: new Date('2025-01-09T10:00:10').toISOString(),
  },
  {
    messageId: 'msg-3',
    conversationId: 'test-conversation-id',
    text: 'The weather is sunny today.',
    isCreatedByUser: false,
    createdAt: new Date('2025-01-09T10:00:20').toISOString(),
  },
  {
    messageId: 'msg-4',
    conversationId: 'test-conversation-id',
    text: 'Thank you!',
    isCreatedByUser: true,
    createdAt: new Date('2025-01-09T10:00:30').toISOString(),
  }
];

describe('MultiMessage - Conversation Display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderMultiMessage = (messages: any[]) => {
    return render(
      <RecoilRoot>
        <MultiMessage
          messageId="conversation-root"
          messagesTree={messages}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>
    );
  };

  it('should display all conversation messages explicitly without stacking', () => {
    renderMultiMessage(mockMessages);

    // All messages should be visible
    expect(screen.getByText('Hello, how can I help you?')).toBeInTheDocument();
    expect(screen.getByText('What is the weather like?')).toBeInTheDocument();
    expect(screen.getByText('The weather is sunny today.')).toBeInTheDocument();
    expect(screen.getByText('Thank you!')).toBeInTheDocument();

    // Should NOT show navigation controls since all messages are visible
    expect(screen.queryByTestId('sibling-switch')).not.toBeInTheDocument();
  });

  it('current implementation SHOWS navigation and only displays one message at a time', () => {
    // This test documents the CURRENT behavior which we want to fix
    renderMultiMessage(mockMessages);

    // Currently, it would only show ONE message and navigation
    // This is what we want to change
    const messages = screen.queryAllByTestId(/message-/);
    expect(messages).toHaveLength(1); // Only one message visible - THIS IS THE PROBLEM
    
    // Navigation controls are shown
    expect(screen.queryByTestId('sibling-switch')).toBeInTheDocument();
  });

  it('should display messages in a continuous list without navigation', () => {
    // Test for the DESIRED behavior
    const { container } = renderMultiMessage(mockMessages);

    // All messages should be in a continuous flow
    const allMessages = container.querySelectorAll('[data-testid^="message-"]');
    expect(allMessages).toHaveLength(4); // All 4 messages should be visible

    // Check they are all visible without navigation
    mockMessages.forEach((msg) => {
      expect(screen.getByTestId(`message-${msg.messageId}`)).toBeInTheDocument();
      expect(screen.getByText(msg.text)).toBeInTheDocument();
    });
  });
});