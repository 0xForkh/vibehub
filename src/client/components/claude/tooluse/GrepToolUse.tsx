import { Search, FileText, Hash } from 'lucide-react';
import { ToolCard } from './ToolCard';

interface GrepToolUseProps {
  input: {
    pattern: string;
    path?: string;
    glob?: string;
    type?: string;
    output_mode?: 'content' | 'files_with_matches' | 'count';
    '-i'?: boolean;
    '-n'?: boolean;
    '-A'?: number;
    '-B'?: number;
    '-C'?: number;
    head_limit?: number;
  };
  output?: string;
}

export function GrepToolUse({ input, output }: GrepToolUseProps) {
  const fileCount = output
    ? output.split('\n').filter((line) => line.trim()).length
    : undefined;

  return (
    <ToolCard
      icon={Search}
      color="purple"
      title={
        <>
          Searching: <code className="rounded bg-purple-100 px-1 dark:bg-purple-900">{input.pattern}</code>
        </>
      }
    >
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-purple-600 dark:text-purple-400">
        {input.path && (
          <span className="flex items-center gap-1 min-w-0">
            <FileText className="h-3 w-3 flex-shrink-0" />
            <span className="break-all">{input.path}</span>
          </span>
        )}
        {input.glob && (
          <span className="rounded bg-purple-100 px-1.5 py-0.5 dark:bg-purple-900">
            {input.glob}
          </span>
        )}
        {input.type && (
          <span className="rounded bg-purple-100 px-1.5 py-0.5 dark:bg-purple-900">
            type: {input.type}
          </span>
        )}
        {input['-i'] && (
          <span className="rounded bg-purple-100 px-1.5 py-0.5 dark:bg-purple-900">
            case-insensitive
          </span>
        )}
        {input.output_mode && input.output_mode !== 'files_with_matches' && (
          <span className="rounded bg-purple-100 px-1.5 py-0.5 dark:bg-purple-900">
            {input.output_mode}
          </span>
        )}
      </div>

      {fileCount !== undefined && fileCount > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
          <Hash className="h-3 w-3" />
          <span>{fileCount} {fileCount === 1 ? 'match' : 'matches'}</span>
        </div>
      )}
    </ToolCard>
  );
}
