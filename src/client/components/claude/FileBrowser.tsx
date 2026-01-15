import { X, FolderOpen, ChevronDown, ChevronUp, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Button } from '../ui/button';
import { FileTree, isImageFile } from './FileTree';
import { FilePreview } from './FilePreview';
import type { Socket } from 'socket.io-client';

interface FileBrowserProps {
  sessionId: string;
  socket: Socket | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FileBrowser({ sessionId, socket, isOpen, onClose }: FileBrowserProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [treeKey, setTreeKey] = useState(0); // For forcing tree refresh

  const isImage = selectedPath ? isImageFile(selectedPath) : false;

  const handleFileSelect = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const handleRefresh = useCallback(() => {
    setTreeKey(prev => prev + 1);
    setSelectedPath(null);
  }, []);

  if (!isOpen) return null;

  // Minimized view
  if (isMinimized) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <FolderOpen className="h-4 w-4" />
            <span>File Browser</span>
            <ChevronUp className="h-3 w-3" />
          </button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[60vh] flex-col border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:max-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">File Browser</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHidden(prev => !prev)}
            className={`h-6 w-6 p-0 ${showHidden ? 'bg-gray-200 dark:bg-gray-600' : ''}`}
            title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
          >
            {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-6 w-6 p-0"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(true)}
            className="h-6 w-6 p-0"
            title="Minimize"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0" title="Close">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Split view: Tree | Preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree - left panel */}
        <div className="w-1/3 min-w-[200px] max-w-[300px] overflow-auto border-r border-gray-200 dark:border-gray-700">
          <FileTree
            key={treeKey}
            sessionId={sessionId}
            socket={socket}
            onFileSelect={handleFileSelect}
            selectedPath={selectedPath}
            showHidden={showHidden}
          />
        </div>

        {/* File preview - right panel */}
        <div className="flex-1 overflow-hidden">
          <FilePreview
            sessionId={sessionId}
            socket={socket}
            path={selectedPath}
            isImage={isImage}
          />
        </div>
      </div>
    </div>
  );
}
