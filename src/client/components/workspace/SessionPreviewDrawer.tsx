import { X, MessageSquare } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../ui/button';
import { ClaudeConversationView } from '../claude/ClaudeConversationView';
import type { SessionState } from '../../types/sessionState';

interface SessionPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  sessionState?: SessionState;
  onOpenSession?: (sessionId: string) => void;
}

export function SessionPreviewDrawer({
  isOpen,
  onClose,
  sessionId,
  sessionState,
  onOpenSession,
}: SessionPreviewDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out dark:bg-gray-900 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <span className="font-medium text-gray-800 dark:text-gray-200">
              Session Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            {sessionId && onOpenSession && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenSession(sessionId);
                  onClose();
                }}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Open Session
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {sessionId && sessionState ? (
            <ClaudeConversationView
              messages={sessionState.messages}
              thinking={sessionState.thinking}
              pendingRequest={sessionState.pendingRequest}
              toolResults={sessionState.toolResults}
              sessionId={sessionId}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <div className="text-sm">No session to preview</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
