import { Plug } from 'lucide-react';
import { ToolCard } from './ToolCard';

interface McpToolUseProps {
  toolName: string;
  input: Record<string, unknown>;
}

export function McpToolUse({ toolName, input }: McpToolUseProps) {
  // Parse mcp__server__tool format
  const parts = toolName.replace(/^mcp__/, '').split('__');
  const server = parts[0] || 'unknown';
  const tool = parts.slice(1).join('__') || toolName;

  // Format input for display, filtering out empty values
  const displayInput = Object.entries(input || {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );

  return (
    <ToolCard
      icon={Plug}
      color="cyan"
      title={
        <>
          <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-xs dark:bg-cyan-900">
            {server}
          </span>
          <span>{tool.replace(/_/g, ' ')}</span>
        </>
      }
    >
      {displayInput.length > 0 && (
        <div className="mt-2 space-y-1 text-xs">
          {displayInput.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-cyan-600 dark:text-cyan-400">{key}:</span>
              <span className="min-w-0 break-all text-cyan-800 dark:text-cyan-200">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </ToolCard>
  );
}
