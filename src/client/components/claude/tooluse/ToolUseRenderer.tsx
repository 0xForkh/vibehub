import { useState, useRef, useEffect } from 'react';
import { Check, X, CheckCircle, XCircle, ChevronDown, Globe, Monitor } from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { EditToolUse } from './EditToolUse';
import { ReadToolUse } from './ReadToolUse';
import { WriteToolUse } from './WriteToolUse';
import { BashToolUse } from './BashToolUse';
import { GrepToolUse } from './GrepToolUse';
import { GlobToolUse } from './GlobToolUse';
import { McpToolUse } from './McpToolUse';
import { DefaultToolUse } from './DefaultToolUse';
import { ExitPlanModeToolUse } from './ExitPlanModeToolUse';

interface ApprovalButtonsProps {
  toolName: string;
  onApprove?: () => void;
  onApproveAndRemember?: () => void;
  onApproveAndRememberGlobal?: () => void;
  onApproveAndSwitchToAcceptEdits?: () => void;
  onApproveAndSwitchToBypass?: () => void;
  onDeny?: () => void;
}

// Check if tool is a file editing tool (Edit, Write)
function isFileEditTool(toolName: string): boolean {
  return toolName === 'Edit' || toolName === 'Write';
}

function ApprovalButtons({
  toolName,
  onApprove,
  onApproveAndRemember,
  onApproveAndRememberGlobal,
  onApproveAndSwitchToAcceptEdits,
  onApproveAndSwitchToBypass,
  onDeny,
}: ApprovalButtonsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isEditTool = isFileEditTool(toolName);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Approve with dropdown for additional options */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex">
          <Button
            onClick={onApprove}
            size="sm"
            className="flex items-center gap-1.5 rounded-r-none border-r-0 bg-green-600 hover:bg-green-700"
          >
            <Check className="h-4 w-4" />
            Approve
          </Button>
          <Button
            onClick={() => setIsOpen(!isOpen)}
            size="sm"
            className="rounded-l-none bg-green-600 px-1.5 hover:bg-green-700"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>

        {isOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {isEditTool ? (
              // File edit tools: show mode-switching options
              <>
                <button
                  onClick={() => {
                    onApproveAndSwitchToAcceptEdits?.();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Monitor className="h-4 w-4 text-blue-500" />
                  Accept Edits mode
                </button>
                <button
                  onClick={() => {
                    onApproveAndSwitchToBypass?.();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Globe className="h-4 w-4 text-red-500" />
                  Bypass mode
                </button>
              </>
            ) : (
              // Other tools: show "always allow" options
              <>
                <button
                  onClick={() => {
                    onApproveAndRemember?.();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Monitor className="h-4 w-4" />
                  Always allow (session)
                </button>
                <button
                  onClick={() => {
                    onApproveAndRememberGlobal?.();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Globe className="h-4 w-4" />
                  Always allow (global)
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <Button
        onClick={onDeny}
        size="sm"
        variant="outline"
        className="flex items-center gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        <X className="h-4 w-4" />
        Deny
      </Button>
    </div>
  );
}

interface ToolUseRendererProps {
  toolName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any;
  output?: unknown;
  showApprovalButtons?: boolean;
  approvalDecision?: 'approved' | 'rejected' | null;
  onApprove?: () => void;
  onApproveAndRemember?: () => void;
  onApproveAndRememberGlobal?: () => void;
  onApproveAndSwitchToAcceptEdits?: () => void;
  onApproveAndSwitchToBypass?: () => void;
  onDeny?: () => void;
}

export function ToolUseRenderer({
  toolName,
  input,
  output,
  showApprovalButtons = false,
  approvalDecision,
  onApprove,
  onApproveAndRemember,
  onApproveAndRememberGlobal,
  onApproveAndSwitchToAcceptEdits,
  onApproveAndSwitchToBypass,
  onDeny
}: ToolUseRendererProps) {
  // Render the appropriate tool component
  let toolComponent;

  switch (toolName) {
    case 'Edit':
      if (input?.old_string && input?.new_string) {
        toolComponent = <EditToolUse input={input} />;
      }
      break;

    case 'Read':
      if (input?.file_path) {
        toolComponent = <ReadToolUse input={input} />;
      }
      break;

    case 'Write':
      if (input?.file_path) {
        toolComponent = <WriteToolUse input={input} />;
      }
      break;

    case 'Bash':
      if (input?.command) {
        // Extract output string from the tool result
        // The result can be: string, {output: string}, or {stdout: string, stderr?: string}
        let bashOutput: string | undefined;
        if (typeof output === 'string') {
          bashOutput = output;
        } else if (output && typeof output === 'object') {
          const out = output as Record<string, unknown>;
          if ('stdout' in out) {
            bashOutput = String(out.stdout);
            if ('stderr' in out && out.stderr) {
              bashOutput += '\n' + String(out.stderr);
            }
          } else if ('output' in out) {
            bashOutput = String(out.output);
          }
        }
        toolComponent = <BashToolUse input={input} output={bashOutput} />;
      }
      break;

    case 'ExitPlanMode':
      if (input?.plan) {
        toolComponent = <ExitPlanModeToolUse input={input} />;
      }
      break;

    case 'Grep': {
      let grepOutput: string | undefined;
      if (typeof output === 'string') {
        grepOutput = output;
      } else if (output && typeof output === 'object' && 'output' in output) {
        grepOutput = String((output as Record<string, unknown>).output);
      }
      toolComponent = <GrepToolUse input={input} output={grepOutput} />;
      break;
    }

    case 'Glob': {
      let globOutput: string | undefined;
      if (typeof output === 'string') {
        globOutput = output;
      } else if (output && typeof output === 'object' && 'output' in output) {
        globOutput = String((output as Record<string, unknown>).output);
      }
      toolComponent = <GlobToolUse input={input} output={globOutput} />;
      break;
    }

    default:
      // Fall through to default
      break;
  }

  // Default rendering for unknown tools or incomplete data
  if (!toolComponent) {
    // Check if it's an MCP tool (mcp__server__tool format)
    if (toolName.startsWith('mcp__')) {
      toolComponent = <McpToolUse toolName={toolName} input={input} />;
    } else {
      toolComponent = <DefaultToolUse toolName={toolName} input={input} />;
    }
  }

  // If no approval buttons needed, just return the tool component
  if (!showApprovalButtons) {
    return toolComponent;
  }

  // Wrap with approval UI
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
        <div className="flex items-start gap-2">
          <span className="text-yellow-600 dark:text-yellow-400">⚠️</span>
          <div className="flex-1 text-sm text-yellow-700 dark:text-yellow-300">
            <p className="font-medium">Requesting permission to use tool</p>
          </div>
        </div>
      </div>

      {toolComponent}

      {approvalDecision === 'approved' ? (
        <Badge className="flex w-fit items-center gap-1.5 bg-green-600 text-white">
          <CheckCircle className="h-3.5 w-3.5" />
          Approved
        </Badge>
      ) : approvalDecision === 'rejected' ? (
        <Badge className="flex w-fit items-center gap-1.5 bg-red-600 text-white">
          <XCircle className="h-3.5 w-3.5" />
          Rejected
        </Badge>
      ) : (
        <ApprovalButtons
          toolName={toolName}
          onApprove={onApprove}
          onApproveAndRemember={onApproveAndRemember}
          onApproveAndRememberGlobal={onApproveAndRememberGlobal}
          onApproveAndSwitchToAcceptEdits={onApproveAndSwitchToAcceptEdits}
          onApproveAndSwitchToBypass={onApproveAndSwitchToBypass}
          onDeny={onDeny}
        />
      )}
    </div>
  );
}
