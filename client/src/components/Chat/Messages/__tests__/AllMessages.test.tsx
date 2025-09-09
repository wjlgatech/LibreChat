import React from 'react';
import { render, screen } from '@testing-library/react';
import AllMessages from '../AllMessages';
import type { TMessage } from 'librechat-data-provider';

// Mock child components
jest.mock('~/components/Messages/MessageContent', () => ({
  __esModule: true,
  default: ({ message }: any) => (
    <div data-testid={`message-content-${message.messageId}`}>
      {message.content || message.text}
    </div>
  ),
}));

jest.mock('../MessageParts', () => ({
  __esModule: true,
  default: ({ message }: any) => (
    <div data-testid={`message-parts-${message.messageId}`}>
      {message.content || message.text}
    </div>
  ),
}));

jest.mock('../Message', () => ({
  __esModule: true,
  default: ({ message, setSiblingIdx }: any) => (
    <div 
      data-testid={`message-${message.messageId}`}
      data-has-navigation={setSiblingIdx !== undefined ? 'true' : 'false'}
    >
      {message.text}
    </div>
  ),
}));

describe('AllMessages', () => {
  const mockMessages: TMessage[] = [
    {
      messageId: 'msg-1',
      conversationId: 'test-conv',
      text: 'Hello, how can I help you?',
      isCreatedByUser: false,
      user: 'assistant',
      parentMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      messageId: 'msg-2',
      conversationId: 'test-conv',
      text: 'What is the weather like?',
      isCreatedByUser: true,
      user: 'user',
      parentMessageId: 'msg-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      messageId: 'msg-3',
      conversationId: 'test-conv',
      text: 'The weather is sunny today.',
      isCreatedByUser: false,
      user: 'assistant',
      parentMessageId: 'msg-2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      messageId: 'msg-4',
      conversationId: 'test-conv',
      text: 'Thank you!',
      isCreatedByUser: true,
      user: 'user',
      parentMessageId: 'msg-3',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  it('displays all messages in the tree', () => {
    render(
      <AllMessages
        messageId="root"
        messagesTree={mockMessages}
        currentEditId={null}
        setCurrentEditId={jest.fn()}
      />
    );

    // All messages should be rendered
    expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
    expect(screen.getByTestId('message-msg-2')).toBeInTheDocument();
    expect(screen.getByTestId('message-msg-3')).toBeInTheDocument();
    expect(screen.getByTestId('message-msg-4')).toBeInTheDocument();

    // All message texts should be visible
    expect(screen.getByText('Hello, how can I help you?')).toBeInTheDocument();
    expect(screen.getByText('What is the weather like?')).toBeInTheDocument();
    expect(screen.getByText('The weather is sunny today.')).toBeInTheDocument();
    expect(screen.getByText('Thank you!')).toBeInTheDocument();
  });

  it('does not pass sibling navigation props to child components', () => {
    render(
      <AllMessages
        messageId="root"
        messagesTree={mockMessages}
        currentEditId={null}
        setCurrentEditId={jest.fn()}
      />
    );

    // All messages should have data-has-navigation="false" since setSiblingIdx is undefined
    const messages = screen.getAllByTestId(/^message-msg-/);
    messages.forEach(message => {
      expect(message).toHaveAttribute('data-has-navigation', 'false');
    });
    
    // Verify no navigation text like "1 / 4" is shown
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it('handles empty messages tree', () => {
    const { container } = render(
      <AllMessages
        messageId="root"
        messagesTree={[]}
        currentEditId={null}
        setCurrentEditId={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('handles null messages tree', () => {
    const { container } = render(
      <AllMessages
        messageId="root"
        messagesTree={null}
        currentEditId={null}
        setCurrentEditId={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('handles messages with content property', () => {
    const messagesWithContent = [
      {
        ...mockMessages[0],
        content: 'Message with content property',
        text: undefined,
      },
    ];

    render(
      <AllMessages
        messageId="root"
        messagesTree={messagesWithContent as any}
        currentEditId={null}
        setCurrentEditId={jest.fn()}
      />
    );

    expect(screen.getByTestId('message-content-msg-1')).toBeInTheDocument();
    expect(screen.getByText('Message with content property')).toBeInTheDocument();
  });
});