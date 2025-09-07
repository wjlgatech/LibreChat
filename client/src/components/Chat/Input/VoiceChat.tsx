interface VoiceChatProps {
  disabled?: boolean;
  onResponse?: (text: string) => void;
}

export default function VoiceChat({ disabled = false, onResponse }: VoiceChatProps) {
  // Placeholder component - functionality moved to other voice components
  return null;
}