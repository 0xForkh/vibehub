import { CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ToolCard } from './ToolCard';

interface ExitPlanModeToolUseProps {
  input: {
    plan?: string;
  };
}

export function ExitPlanModeToolUse({ input }: ExitPlanModeToolUseProps) {
  return (
    <ToolCard icon={CheckCircle} color="purple" title="Plan Ready">
      {input.plan && (
        <div className="prose prose-sm mt-2 max-w-none text-sm text-purple-900 dark:prose-invert dark:text-purple-100">
          <ReactMarkdown>{input.plan}</ReactMarkdown>
        </div>
      )}
    </ToolCard>
  );
}
