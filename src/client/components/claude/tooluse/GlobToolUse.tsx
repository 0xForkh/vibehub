import { FolderSearch, FileText, Hash } from 'lucide-react';
import { ToolCard } from './ToolCard';

interface GlobToolUseProps {
  input: {
    pattern: string;
    path?: string;
  };
  output?: string;
}

export function GlobToolUse({ input, output }: GlobToolUseProps) {
  const fileCount = output
    ? output.split('\n').filter((line) => line.trim()).length
    : undefined;

  return (
    <ToolCard
      icon={FolderSearch}
      color="amber"
      title={
        <>
          Finding: <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">{input.pattern}</code>
        </>
      }
    >
      {input.path && (
        <div className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <FileText className="h-3 w-3 flex-shrink-0" />
          <span className="min-w-0 break-all">in {input.path}</span>
        </div>
      )}

      {fileCount !== undefined && fileCount > 0 && (
        <div className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <Hash className="h-3 w-3" />
          <span>{fileCount} {fileCount === 1 ? 'file' : 'files'} found</span>
        </div>
      )}
    </ToolCard>
  );
}
