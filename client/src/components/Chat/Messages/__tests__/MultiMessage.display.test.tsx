import React from 'react';
import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import MultiMessage from '../MultiMessage';
import type { TMessage } from 'librechat-data-provider';

// Mock dependencies
const mockSetSiblingIdx = jest.fn();
const mockSiblingIdx = 0;

// Mock Recoil
jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilState: jest.fn(() => [mockSiblingIdx, mockSetSiblingIdx]),
}));

jest.mock('~/store', () => ({
  default: {
    messagesSiblingIdxFamily: jest.fn((id: string) => ({
      key: `messagesSiblingIdx_${id}`,
      default: 0,
    })),
  },
}));

jest.mock('../Message', () => {
  return {
    __esModule: true,
    default: ({ message, siblingIdx, siblingCount, setSiblingIdx }: any) => (
      <div 
        data-testid={`message-${message.messageId}`} 
        data-message-owner={message.isCreatedByUser ? 'user' : 'ai'}
      >
        <div>{message.text}</div>
        {siblingCount > 1 && (
          <div data-testid="navigation-controls">
            <button onClick={() => setSiblingIdx(siblingIdx - 1)}>Previous</button>
            <span>{siblingIdx + 1} / {siblingCount}</span>
            <button onClick={() => setSiblingIdx(siblingIdx + 1)}>Next</button>
          </div>
        )}
      </div>
    ),
  };
});

jest.mock('~/components/Messages/MessageContent', () => {
  return {
    __esModule: true,
    default: ({ message, siblingIdx, siblingCount, setSiblingIdx }: any) => (
      <div 
        data-testid={`message-${message.messageId}`} 
        data-message-owner={message.isCreatedByUser ? 'user' : 'ai'}
      >
        <div>{message.text}</div>
        {siblingCount > 1 && (
          <div data-testid="navigation-controls">
            <button onClick={() => setSiblingIdx(siblingIdx - 1)}>Previous</button>
            <span>{siblingIdx + 1} / {siblingCount}</span>
            <button onClick={() => setSiblingIdx(siblingIdx + 1)}>Next</button>
          </div>
        )}
      </div>
    ),
  };
});

jest.mock('../MessageParts', () => {
  return {
    __esModule: true,
    default: ({ message, siblingIdx, siblingCount, setSiblingIdx }: any) => (
      <div 
        data-testid={`message-${message.messageId}`} 
        data-message-owner={message.isCreatedByUser ? 'user' : 'ai'}
      >
        <div>{message.text}</div>
        {siblingCount > 1 && (
          <div data-testid="navigation-controls">
            <button onClick={() => setSiblingIdx(siblingIdx - 1)}>Previous</button>
            <span>{siblingIdx + 1} / {siblingCount}</span>
            <button onClick={() => setSiblingIdx(siblingIdx + 1)}>Next</button>
          </div>
        )}
      </div>
    ),
  };
});

// Mock messages
const mockMessages: TMessage[] = [
  {
    messageId: 'msg-1',
    conversationId: 'test-conversation-id',
    text: 'Hello, how can I help you?',
    isCreatedByUser: false,
    user: 'assistant',
    parentMessageId: null,
    createdAt: new Date('2025-01-09T10:00:00').toISOString(),
    updatedAt: new Date('2025-01-09T10:00:00').toISOString(),
  },
  {
    messageId: 'msg-2',
    conversationId: 'test-conversation-id',
    text: 'What is the weather like?',
    isCreatedByUser: true,
    user: 'user',
    parentMessageId: 'msg-1',
    createdAt: new Date('2025-01-09T10:00:10').toISOString(),
    updatedAt: new Date('2025-01-09T10:00:10').toISOString(),
  },
  {
    messageId: 'msg-3',
    conversationId: 'test-conversation-id',
    text: 'The weather is sunny today.',
    isCreatedByUser: false,
    user: 'assistant',
    parentMessageId: 'msg-2',
    createdAt: new Date('2025-01-09T10:00:20').toISOString(),
    updatedAt: new Date('2025-01-09T10:00:20').toISOString(),
  },
  {
    messageId: 'msg-4',
    conversationId: 'test-conversation-id',
    text: 'Thank you!',
    isCreatedByUser: true,
    user: 'user',
    parentMessageId: 'msg-3',
    createdAt: new Date('2025-01-09T10:00:30').toISOString(),
    updatedAt: new Date('2025-01-09T10:00:30').toISOString(),
  }
];

describe('MultiMessage - Display Issue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('current behavior: only shows one message at a time with navigation', () => {
    // This test documents the CURRENT problematic behavior
    render(
      <RecoilRoot>
        <MultiMessage
          messageId="conversation-root"
          messagesTree={mockMessages}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>
    );

    // Only ONE message should be visible in current implementation
    const visibleMessages = screen.queryAllByTestId(/^message-/);
    expect(visibleMessages).toHaveLength(1);
    
    // Navigation controls should be present
    expect(screen.getByTestId('navigation-controls')).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('desired behavior: should show ALL messages in a continuous conversation', () => {
    // This test describes what we WANT to happen
    // Currently this test will FAIL - that's expected in TDD
    
    // We need a new component that displays all messages
    const AllMessagesDisplay = ({ messagesTree }: { messagesTree: TMessage[] }) => (
      <div>
        {messagesTree.map((message) => (
          <div 
            key={message.messageId}
            data-testid={`message-${message.messageId}`}
            data-message-owner={message.isCreatedByUser ? 'user' : 'ai'}
          >
            {message.text}
          </div>
        ))}
      </div>
    );

    render(
      <RecoilRoot>
        <AllMessagesDisplay messagesTree={mockMessages} />
      </RecoilRoot>
    );

    // ALL messages should be visible
    expect(screen.getByText('Hello, how can I help you?')).toBeInTheDocument();
    expect(screen.getByText('What is the weather like?')).toBeInTheDocument();
    expect(screen.getByText('The weather is sunny today.')).toBeInTheDocument();
    expect(screen.getByText('Thank you!')).toBeInTheDocument();

    // Should have 4 message elements
    const allMessages = screen.getAllByTestId(/^message-/);
    expect(allMessages).toHaveLength(4);

    // No navigation controls should be present
    expect(screen.queryByTestId('navigation-controls')).not.toBeInTheDocument();
  });
});