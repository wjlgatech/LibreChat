import { useRecoilValue } from 'recoil';
import { voiceListeningState, voiceTranscriptState, voiceContinuousModeState } from '~/store/voice';
import { cn } from '~/utils';

export default function VoiceTranscriptDisplay() {
  const isListening = useRecoilValue(voiceListeningState);
  const transcript = useRecoilValue(voiceTranscriptState);
  const isContinuousMode = useRecoilValue(voiceContinuousModeState);

  if (!isListening || !transcript.text) {
    return null;
  }

  return (
    <div className="absolute -top-20 left-0 right-0 mx-auto max-w-2xl px-4">
      <div className={cn(
        "rounded-lg p-3 shadow-lg",
        "bg-surface-primary-alt border border-border-light",
        "animate-in slide-in-from-bottom-2 duration-300"
      )}>
        <div className="flex items-start gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground">
              {isContinuousMode ? 'Continuous mode' : 'Listening'}
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm text-text-primary">
          {transcript.text}
          {!transcript.isFinal && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-text-primary" />
          )}
        </p>
      </div>
    </div>
  );
}