import { ChevronRight, ChevronDown, Folder, FolderOpen, File, FileCode, FileJson, FileText, FileImage, Loader2 } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import type { Socket } from 'socket.io-client';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

interface TreeNode extends FileEntry {
  path: string;
  children?: TreeNode[];
  isLoading?: boolean;
  isExpanded?: boolean;
}

interface FileTreeProps {
  sessionId: string;
  socket: Socket | null;
  onFileSelect: (path: string) => void;
  selectedPath: string | null;
  showHidden: boolean;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];

// Get icon based on file type/extension
function getFileIcon(name: string, type: 'file' | 'directory', isExpanded?: boolean) {
  if (type === 'directory') {
    return isExpanded ? <FolderOpen className="h-4 w-4 flex-shrink-0 text-yellow-500" /> : <Folder className="h-4 w-4 flex-shrink-0 text-yellow-500" />;
  }

  const ext = name.split('.').pop()?.toLowerCase() || '';
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp'];
  const jsonExts = ['json', 'yaml', 'yml'];
  const textExts = ['md', 'txt', 'readme'];

  if (IMAGE_EXTS.includes(ext)) {
    return <FileImage className="h-4 w-4 flex-shrink-0 text-purple-500" />;
  }
  if (codeExts.includes(ext)) {
    return <FileCode className="h-4 w-4 flex-shrink-0 text-blue-500" />;
  }
  if (jsonExts.includes(ext)) {
    return <FileJson className="h-4 w-4 flex-shrink-0 text-green-500" />;
  }
  if (textExts.includes(ext) || name.toLowerCase() === 'readme') {
    return <FileText className="h-4 w-4 flex-shrink-0 text-gray-500" />;
  }

  return <File className="h-4 w-4 flex-shrink-0 text-gray-400" />;
}

export function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTS.includes(ext);
}

function TreeItem({
  node,
  depth,
  onToggle,
  onSelect,
  selectedPath,
}: {
  node: TreeNode;
  depth: number;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}) {
  const isSelected = selectedPath === node.path;
  const paddingLeft = depth * 16 + 8;

  const handleClick = () => {
    if (node.type === 'directory') {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 py-1 pr-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
          isSelected ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        {node.type === 'directory' && (
          <span className="flex h-4 w-4 items-center justify-center">
            {node.isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
            ) : node.isExpanded ? (
              <ChevronDown className="h-3 w-3 text-gray-400" />
            ) : (
              <ChevronRight className="h-3 w-3 text-gray-400" />
            )}
          </span>
        )}
        {node.type === 'file' && <span className="w-4" />}
        {getFileIcon(node.name, node.type, node.isExpanded)}
        <span className="truncate text-sm text-gray-700 dark:text-gray-300">{node.name}</span>
      </div>
      {node.isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ sessionId, socket, onFileSelect, selectedPath, showHidden }: FileTreeProps) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load directory with showHidden option
  const loadDirectory = useCallback(
    (path: string, callback: (entries: FileEntry[]) => void) => {
      if (!socket) return;

      const handleResult = ({ path: resultPath, entries, error: err }: {
        path: string;
        entries: FileEntry[];
        error?: string
      }) => {
        if (resultPath === path) {
          socket.off('claude:fs_list_result', handleResult);
          if (err) {
            setError(err);
          } else {
            callback(entries);
          }
        }
      };

      socket.on('claude:fs_list_result', handleResult);
      socket.emit('claude:fs_list', { sessionId, path, showHidden });
    },
    [socket, sessionId, showHidden]
  );

  // Load root on mount or when showHidden changes
  useEffect(() => {
    if (socket) {
      setIsLoading(true);
      setNodes([]);
      loadDirectory('.', (entries) => {
        setNodes(
          entries.map((e) => ({
            ...e,
            path: e.name,
            children: e.type === 'directory' ? [] : undefined,
          }))
        );
        setIsLoading(false);
      });
    }
  }, [socket, loadDirectory]);

  const handleToggle = useCallback(
    (path: string) => {
      setNodes((prev) => {
        const updateNode = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map((node) => {
            if (node.path === path) {
              if (node.isExpanded) {
                // Collapse
                return { ...node, isExpanded: false };
              } else {
                // Expand - load children if not loaded
                if (node.children && node.children.length === 0) {
                  // Mark as loading
                  const loadingNode = { ...node, isLoading: true, isExpanded: true };

                  // Load children asynchronously
                  loadDirectory(path, (entries) => {
                    setNodes((prev) => {
                      const update = (nodes: TreeNode[]): TreeNode[] =>
                        nodes.map((n) => {
                          if (n.path === path) {
                            return {
                              ...n,
                              isLoading: false,
                              isExpanded: true,
                              children: entries.map((e) => ({
                                ...e,
                                path: `${path}/${e.name}`,
                                children: e.type === 'directory' ? [] : undefined,
                              })),
                            };
                          }
                          if (n.children) {
                            return { ...n, children: update(n.children) };
                          }
                          return n;
                        });
                      return update(prev);
                    });
                  });

                  return loadingNode;
                }
                return { ...node, isExpanded: true };
              }
            }
            if (node.children) {
              return { ...node, children: updateNode(node.children) };
            }
            return node;
          });
        return updateNode(prev);
      });
    },
    [loadDirectory]
  );

  const handleSelect = useCallback(
    (path: string) => {
      onFileSelect(path);
    },
    [onFileSelect]
  );

  if (isLoading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500">
        Error: {error}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        No files found
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          onToggle={handleToggle}
          onSelect={handleSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}
