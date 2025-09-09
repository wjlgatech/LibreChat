import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import MessageContent from '~/components/Messages/MessageContent';
import MessageParts from './MessageParts';
import Message from './Message';

export default function AllMessages({
  messageId,
  messagesTree,
  currentEditId,
  setCurrentEditId,
}: TMessageProps) {
  if (!(messagesTree && messagesTree.length)) {
    return null;
  }

  // Display ALL messages in the tree, not just one at a time
  return (
    <>
      {messagesTree.map((message, index) => {
        if (!message || !message.messageId) {
          return null;
        }

        // For multi-sibling messages, we still need to pass sibling info
        // but we show all messages at once
        const commonProps = {
          message,
          currentEditId,
          setCurrentEditId,
          siblingIdx: index,
          siblingCount: messagesTree.length,
          // We don't pass setSiblingIdx because we don't want navigation
          setSiblingIdx: undefined,
        };

        if (isAssistantsEndpoint(message.endpoint) && message.content) {
          return <MessageParts key={message.messageId} {...commonProps} />;
        } else if (message.content) {
          return <MessageContent key={message.messageId} {...commonProps} />;
        }

        return <Message key={message.messageId} {...commonProps} />;
      })}
    </>
  );
}