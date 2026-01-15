import { FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { ToolCard } from './ToolCard';

interface WriteToolUseProps {
  input: {
    file_path?: string;
    content?: string;
  };
}

export function WriteToolUse({ input }: WriteToolUseProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = input.content && input.content.length > 0;

  // Truncate content for preview
  const previewLines = 5;
  const contentLines = input.content?.split('\n') || [];
  const truncatedContent = contentLines.slice(0, previewLines).join('\n');
  const hasMore = contentLines.length > previewLines;

  return (
    <ToolCard
      icon={FolderPlus}
      color="purple"
      title={<>Writing: {input.file_path || 'file'}</>}
      badge={hasContent ? <>{isExpanded ? '▼' : '▶'} {contentLines.length} lines</> : undefined}
      onClick={hasContent ? () => setIsExpanded(!isExpanded) : undefined}
    >
      {hasContent && (
        <div className="mt-2">
          <pre className="overflow-x-auto rounded bg-purple-100 p-2 text-xs text-purple-900 dark:bg-purple-900 dark:text-purple-100">
            {isExpanded ? input.content : truncatedContent}
            {!isExpanded && hasMore && (
              <div className="mt-1 text-purple-600 dark:text-purple-400">
                ... ({contentLines.length - previewLines} more lines)
              </div>
            )}
          </pre>
        </div>
      )}
    </ToolCard>
  );
}
