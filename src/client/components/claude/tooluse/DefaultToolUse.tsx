import { Code } from 'lucide-react';
import { ToolCard } from './ToolCard';

interface DefaultToolUseProps {
  toolName: string;
  input: unknown;
}

export function DefaultToolUse({ toolName, input }: DefaultToolUseProps) {
  const inputJson = input
    ? (() => {
        try {
          return JSON.stringify(input, null, 2);
        } catch {
          return '{}';
        }
      })()
    : '{}';

  return (
    <ToolCard icon={Code} color="blue" title={toolName}>
      <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
        {inputJson}
      </pre>
    </ToolCard>
  );
}
