import { FolderOpen, RefreshCw, ArrowLeft } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Button } from '../ui/button';
import { ModalPanel } from '../ui/ModalPanel';
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
  const [treeKey, setTreeKey] = useState(0);
  // On mobile, track whether we're viewing the file list or file preview
  const [mobileShowPreview, setMobileShowPreview] = useState(false);

  const isImage = selectedPath ? isImageFile(selectedPath) : false;

  const handleFileSelect = useCallback((path: string) => {
    setSelectedPath(path);
    setMobileShowPreview(true);
  }, []);

  const handleRefresh = useCallback(() => {
    setTreeKey(prev => prev + 1);
    setSelectedPath(null);
    setMobileShowPreview(false);
  }, []);

  const handleBackToList = useCallback(() => {
    setMobileShowPreview(false);
  }, []);

  // On mobile, close goes back to list first, then closes modal
  const handleClose = useCallback(() => {
    if (mobileShowPreview && window.innerWidth < 768) {
      setMobileShowPreview(false);
    } else {
      onClose();
    }
  }, [mobileShowPreview, onClose]);

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={handleClose}
      title="File Browser"
      icon={<FolderOpen className="h-4 w-4 text-yellow-500" />}
      width="4xl"
      toolbar={
        <>
          {/* Back button - mobile only, when viewing preview */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToList}
            className={`h-6 w-6 p-0 md:hidden ${!mobileShowPreview ? 'hidden' : ''}`}
            title="Back to file list"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
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
        </>
      }
    >
      {/* Desktop: Split view | Mobile: Single view */}
      <div className="flex flex-1 min-h-0" style={{ height: '60vh' }}>
        {/* File tree - always visible on desktop, conditionally on mobile */}
        <div className={`w-full md:w-1/3 md:min-w-[200px] md:max-w-[300px] border-r border-gray-700 bg-gray-900 overflow-y-auto ${mobileShowPreview ? 'hidden md:block' : ''}`}>
          <FileTree
            key={treeKey}
            sessionId={sessionId}
            socket={socket}
            onFileSelect={handleFileSelect}
            selectedPath={selectedPath}
            showHidden={true}
          />
        </div>

        {/* File preview - always visible on desktop, conditionally on mobile */}
        <div className={`flex-1 flex-col min-h-0 min-w-0 bg-gray-900 ${mobileShowPreview ? 'flex' : 'hidden md:flex'}`}>
          <FilePreview
            sessionId={sessionId}
            socket={socket}
            path={selectedPath}
            isImage={isImage}
          />
        </div>
      </div>
    </ModalPanel>
  );
}
