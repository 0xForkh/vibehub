import { FileText } from 'lucide-react';
import { ToolCard } from './ToolCard';

interface ReadToolUseProps {
  input: {
    file_path?: string;
    offset?: number;
    limit?: number;
  };
}

export function ReadToolUse({ input }: ReadToolUseProps) {
  return (
    <ToolCard
      icon={FileText}
      color="green"
      title={<>Reading: {input.file_path || 'file'}</>}
    >
      {(input.offset || input.limit) && (
        <div className="mt-1 text-xs text-green-600 dark:text-green-400">
          {input.offset && `Lines ${input.offset}-${(input.offset || 0) + (input.limit || 0)}`}
        </div>
      )}
    </ToolCard>
  );
}
