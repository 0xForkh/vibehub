import { FileText, Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { ToolUseRenderer } from './tooluse/ToolUseRenderer';
import type { ClaudeMessage, ClaudeMessageContent, PermissionRequest } from '../../types/claude';

// Check if message content is tool-use only (no text)
function isToolOnlyContent(content: string | ClaudeMessageContent[]): boolean {
  if (typeof content === 'string') return false;
  return content.every((block) => block.type === 'tool_use');
}

interface ClaudeConversationViewProps {
  messages: ClaudeMessage[];
  thinking: boolean;
  pendingRequest?: PermissionRequest | null;
  onApproveRequest?: (requestId: string) => void;
  onApproveAndRememberRequest?: (requestId: string) => void;
  onApproveAndRememberGlobalRequest?: (requestId: string) => void;
  onApproveAndSwitchToAcceptEdits?: (requestId: string) => void;
  onApproveAndSwitchToBypass?: (requestId: string) => void;
  onDenyRequest?: (requestId: string) => void;
  toolResults?: Map<string, unknown>;
  sessionId: string;
}

export function ClaudeConversationView({
  messages,
  thinking,
  pendingRequest,
  onApproveRequest,
  onApproveAndRememberRequest,
  onApproveAndRememberGlobalRequest,
  onApproveAndSwitchToAcceptEdits,
  onApproveAndSwitchToBypass,
  onDenyRequest,
  toolResults = new Map(),
  sessionId,
}: ClaudeConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const isInitialLoadRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  // Check if user is near the bottom of the scroll container
  const isNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 100; // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Handle scroll events to detect when user manually scrolls up
  const handleScroll = useCallback(() => {
    // Ignore scroll events during initial load
    if (isInitialLoadRef.current) return;
    const nearBottom = isNearBottom();
    setIsUserScrolledUp(!nearBottom);
  }, [isNearBottom]);

  // Auto-scroll to bottom when new messages arrive (only if user hasn't scrolled up)
  useEffect(() => {
    // Detect initial load vs incremental updates
    const isInitialBatch = lastMessageCountRef.current === 0 && messages.length > 0;
    lastMessageCountRef.current = messages.length;

    if (isInitialBatch || !isUserScrolledUp) {
      // Use instant scroll for initial load, smooth for updates
      messagesEndRef.current?.scrollIntoView({ behavior: isInitialBatch ? 'instant' : 'smooth' });

      // Mark initial load complete after a short delay
      if (isInitialBatch) {
        setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 100);
      }
    }
  }, [messages, thinking, pendingRequest, isUserScrolledUp]);

  // Parse attached files from message text and extract server URLs
  const parseAttachedFiles = (text: string, sessionId: string): { textWithoutFiles: string; files: { name: string; path: string; isImage: boolean }[] } => {
    const attachedFilesMatch = text.match(/\[Attached files\]\n([\s\S]*?)$/);
    if (!attachedFilesMatch) {
      return { textWithoutFiles: text, files: [] };
    }

    const textWithoutFiles = text.replace(/\n\n\[Attached files\]\n[\s\S]*$/, '').trim();
    const filesSection = attachedFilesMatch[1];
    const fileLines = filesSection.split('\n').filter(line => line.startsWith('- '));

    const files = fileLines.map(line => {
      // Parse: "- filename.png (saved to /path/to/file.png)"
      const match = line.match(/^- (.+?) \(saved to (.+?)\)$/);
      if (!match) return null;

      const [, name, fullPath] = match;
      // Extract just the filename from the full path for the API URL
      const filename = fullPath.split('/').pop() || '';
      const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(name);

      return { name, path: `/api/uploads/${sessionId}/${filename}`, isImage };
    }).filter((f): f is { name: string; path: string; isImage: boolean } => f !== null);

    return { textWithoutFiles, files };
  };

  const renderMessageContent = (content: string | ClaudeMessageContent[], sessionId?: string) => {
    if (typeof content === 'string') {
      // Check if this message has attached files and parse them
      const { textWithoutFiles, files } = sessionId
        ? parseAttachedFiles(content, sessionId)
        : { textWithoutFiles: content, files: [] };

      return (
        <>
          {textWithoutFiles && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                  code: ({ inline, children, ...props }: any) => (
                    inline ? (
                      <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code {...props}>{children}</code>
                    )
                  ),
                }}
              >
                {textWithoutFiles}
              </ReactMarkdown>
            </div>
          )}
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {files.map((file, idx) => (
                file.isImage ? (
                  <img
                    key={idx}
                    src={file.path}
                    alt={file.name}
                    className="max-h-64 rounded-lg object-contain"
                  />
                ) : (
                  <div key={idx} className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2">
                    <FileText className="h-5 w-5" />
                    <span className="text-sm">{file.name}</span>
                  </div>
                )
              ))}
            </div>
          )}
        </>
      );
    }

    return (
      <>
        {content.map((block, idx) => {
          if (block.type === 'text') {
            return (
              <div key={idx} className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                    code: ({ inline, children, ...props }: any) => (
                      inline ? (
                        <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800" {...props}>
                          {children}
                        </code>
                      ) : (
                        <code {...props}>{children}</code>
                      )
                    ),
                  }}
                >
                  {block.text || ''}
                </ReactMarkdown>
              </div>
            );
          }

          if (block.type === 'tool_use') {
            // Get the tool result if available
            const toolOutput = block.id ? toolResults.get(block.id) : undefined;
            return (
              <ToolUseRenderer
                key={idx}
                toolName={block.name || 'Unknown'}
                input={block.input}
                output={toolOutput}
              />
            );
          }

          // Render image attachments
          if (block.type === 'image') {
            const imageSrc = block.serverUrl || block.preview;
            return (
              <div key={idx} className="my-2">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={block.fileName || 'Attached image'}
                    className="max-h-64 rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2">
                    <ImageIcon className="h-5 w-5" />
                    <span className="text-sm">{block.fileName || 'Image'}</span>
                  </div>
                )}
              </div>
            );
          }

          // Render document attachments
          if (block.type === 'document') {
            return (
              <div key={idx} className="my-2">
                <div className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2">
                  <FileText className="h-5 w-5" />
                  <span className="text-sm">{block.fileName || 'Document'}</span>
                </div>
              </div>
            );
          }

          return null;
        })}
      </>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="mb-2 text-4xl">💬</div>
              <div className="text-sm">Start a conversation with Claude Code</div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          // If this message is a permission request, render it specially
          if (msg.permissionRequest) {
            const hasDecision = msg.permissionRequest.decision !== null && msg.permissionRequest.decision !== undefined;
            // Look up tool output using toolUseId
            const toolOutput = msg.permissionRequest.toolUseId
              ? toolResults.get(msg.permissionRequest.toolUseId)
              : undefined;
            return (
              <div key={idx} className="mb-3 flex justify-start">
                <div className="max-w-[80%] rounded-lg bg-white px-3 py-2 shadow-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                  <ToolUseRenderer
                    toolName={msg.permissionRequest.toolName}
                    input={msg.permissionRequest.input}
                    output={toolOutput}
                    showApprovalButtons={!hasDecision}
                    approvalDecision={msg.permissionRequest.decision}
                    onApprove={!hasDecision ? () => onApproveRequest?.(msg.permissionRequest!.requestId) : undefined}
                    onApproveAndRemember={!hasDecision ? () => onApproveAndRememberRequest?.(msg.permissionRequest!.requestId) : undefined}
                    onApproveAndRememberGlobal={!hasDecision ? () => onApproveAndRememberGlobalRequest?.(msg.permissionRequest!.requestId) : undefined}
                    onApproveAndSwitchToAcceptEdits={!hasDecision ? () => onApproveAndSwitchToAcceptEdits?.(msg.permissionRequest!.requestId) : undefined}
                    onApproveAndSwitchToBypass={!hasDecision ? () => onApproveAndSwitchToBypass?.(msg.permissionRequest!.requestId) : undefined}
                    onDeny={!hasDecision ? () => onDenyRequest?.(msg.permissionRequest!.requestId) : undefined}
                  />
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          }

          // Regular message rendering
          const isToolOnly = msg.role === 'assistant' && isToolOnlyContent(msg.content);

          return (
            <div
              key={idx}
              className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] ${
                  isToolOnly
                    ? 'text-gray-900 dark:text-gray-100'
                    : `rounded-lg px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                      }`
                }`}
              >
                {renderMessageContent(msg.content, msg.role === 'user' ? sessionId : undefined)}
                {!isToolOnly && (
                  <div className="mt-1 text-xs opacity-50">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {thinking && !pendingRequest && (
          <div className="mb-3 flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-gray-800">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <div className="flex gap-1">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                </div>
                <span className="text-sm">thinking</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
