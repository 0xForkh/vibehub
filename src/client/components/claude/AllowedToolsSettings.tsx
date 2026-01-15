import { useState } from 'react';
import { X, Plus, Save, Trash2, Globe, Monitor } from 'lucide-react';
import { Button } from '../ui/button';

interface AllowedToolsSettingsProps {
  sessionTools: string[];
  globalTools: string[];
  onUpdateSession: (tools: string[]) => void;
  onUpdateGlobal: (tools: string[]) => void;
  onClose: () => void;
}

type TabType = 'session' | 'global';

function ToolList({
  tools,
  setTools,
  description,
}: {
  tools: string[];
  setTools: (tools: string[]) => void;
  description: string;
}) {
  const [newTool, setNewTool] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = () => {
    if (newTool.trim() && !tools.includes(newTool.trim())) {
      setTools([...tools, newTool.trim()]);
      setNewTool('');
    }
  };

  const handleRemove = (index: number) => {
    setTools(tools.filter((_, i) => i !== index));
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(tools[index]);
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null && editValue.trim()) {
      const newTools = [...tools];
      newTools[editingIndex] = editValue.trim();
      setTools(newTools);
      setEditingIndex(null);
      setEditValue('');
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  return (
    <>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>

      {tools.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          No allowed tools yet. Click "Always Allow" on permission requests to add them.
        </p>
      ) : (
        <ul className="space-y-2">
          {tools.map((tool, index) => (
            <li
              key={index}
              className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
            >
              {editingIndex === index ? (
                <>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <>
                  <code
                    className="flex-1 cursor-pointer text-sm text-gray-800 dark:text-gray-200"
                    onClick={() => handleEdit(index)}
                    title="Click to edit"
                  >
                    {tool}
                  </code>
                  <button
                    onClick={() => handleRemove(index)}
                    className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={newTool}
          onChange={(e) => setNewTool(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          placeholder="e.g., Bash(pnpm build) or Bash(git *)"
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <Button onClick={handleAdd} disabled={!newTool.trim()}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </>
  );
}

export function AllowedToolsSettings({
  sessionTools: initialSessionTools,
  globalTools: initialGlobalTools,
  onUpdateSession,
  onUpdateGlobal,
  onClose,
}: AllowedToolsSettingsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('global');
  const [sessionTools, setSessionTools] = useState<string[]>(initialSessionTools);
  const [globalTools, setGlobalTools] = useState<string[]>(initialGlobalTools);

  const handleSave = () => {
    onUpdateSession(sessionTools);
    onUpdateGlobal(globalTools);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Allowed Tools
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('global')}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'global'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Globe className="h-4 w-4" />
            Global ({globalTools.length})
          </button>
          <button
            onClick={() => setActiveTab('session')}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'session'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Monitor className="h-4 w-4" />
            Session ({sessionTools.length})
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-4">
          {activeTab === 'global' ? (
            <ToolList
              tools={globalTools}
              setTools={setGlobalTools}
              description="Global tools apply to ALL sessions. Use wildcards like Bash(pnpm *) for broader matches."
            />
          ) : (
            <ToolList
              tools={sessionTools}
              setTools={setSessionTools}
              description="Session tools only apply to this session. Use wildcards like Bash(pnpm *) for broader matches."
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
