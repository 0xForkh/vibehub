import { useState } from 'react';
import { Terminal, ChevronDown, ChevronRight } from 'lucide-react';

interface BashToolUseProps {
  input: {
    command?: string;
    description?: string;
  };
  output?: string;
}

export function BashToolUse({ input, output }: BashToolUseProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Count lines in output for display
  const outputLines = output ? output.split('\n').length : 0;
  const hasOutput = output && output.trim().length > 0;

  return (
    <div className="my-1 overflow-hidden rounded-md border border-gray-700 bg-gray-900 p-2">
      <div className="flex min-w-0 items-start gap-2">
        <Terminal className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        <pre className="min-w-0 flex-1 overflow-x-auto text-xs text-green-400">
          <code className="block whitespace-pre-wrap break-all">$ {input.command}</code>
        </pre>
      </div>
      {input.description && (
        <div className="mt-1 break-words pl-6 text-xs text-gray-400">{input.description}</div>
      )}

      {/* Collapsible output section */}
      {hasOutput && (
        <div className="mt-1 pl-6">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>Output ({outputLines} lines)</span>
          </button>

          {isExpanded && (
            <pre className="mt-1 max-h-96 overflow-auto rounded bg-black p-2 text-xs text-gray-300">
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
