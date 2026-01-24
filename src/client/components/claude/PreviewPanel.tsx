import { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, ExternalLink, AlertCircle, CheckCircle, Loader2, Server, Globe, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '../ui/button';
import { api } from '../../lib/api';

interface PreviewPanelProps {
  sessionId: string;
  previewUrl?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface PreviewStatus {
  running: boolean;
  services: string[];
}

type TabType = 'preview' | 'services';

export function PreviewPanel({
  sessionId,
  previewUrl,
  isOpen,
  onClose,
}: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [isExpanded, setIsExpanded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<PreviewStatus | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ status?: boolean; logs?: boolean; restart?: boolean }>({});

  // Fetch status on mount and when tab changes
  useEffect(() => {
    if (isOpen && activeTab === 'services') {
      fetchStatus();
    }
  }, [isOpen, activeTab, sessionId]);

  const fetchStatus = async () => {
    setLoading(prev => ({ ...prev, status: true }));
    try {
      const response = await api.get(`/api/preview/${sessionId}/status`);
      setStatus(response.data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(prev => ({ ...prev, status: false }));
    }
  };

  const fetchLogs = async (serviceName?: string) => {
    setLoading(prev => ({ ...prev, logs: true }));
    try {
      const url = serviceName
        ? `/api/preview/${sessionId}/logs?service=${encodeURIComponent(serviceName)}`
        : `/api/preview/${sessionId}/logs`;
      const response = await api.get(url);
      setLogs(response.data.logs || '');
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(prev => ({ ...prev, logs: false }));
    }
  };

  const restartPreview = async () => {
    setLoading(prev => ({ ...prev, restart: true }));
    try {
      await api.post(`/api/preview/${sessionId}/restart`);
      // Refresh status and iframe
      await fetchStatus();
      refreshIframe();
    } catch (err) {
      console.error('Failed to restart preview:', err);
    } finally {
      setLoading(prev => ({ ...prev, restart: false }));
    }
  };

  const selectService = (serviceName: string | null) => {
    setSelectedService(serviceName);
    if (serviceName) {
      fetchLogs(serviceName);
    } else {
      fetchLogs();
    }
  };

  const refreshIframe = () => {
    setIframeKey(prev => prev + 1);
  };

  if (!isOpen) return null;

  const panelWidth = isExpanded ? 'w-[800px]' : 'w-96';

  return (
    <div className={`fixed inset-y-0 right-0 z-50 flex ${panelWidth} flex-col border-l border-gray-200 bg-white shadow-xl transition-all duration-200 dark:border-gray-700 dark:bg-gray-800`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex rounded-md bg-gray-100 p-0.5 dark:bg-gray-700">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                activeTab === 'preview'
                  ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <Globe className="h-3 w-3" />
              Preview
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                activeTab === 'services'
                  ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <Server className="h-3 w-3" />
              Services
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {activeTab === 'preview' && previewUrl && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshIframe}
                className="h-7 w-7 p-0"
                title="Refresh preview"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                title="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}
          {activeTab === 'services' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={restartPreview}
              disabled={loading.restart}
              className="h-7 w-7 p-0"
              title="Restart preview"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading.restart ? 'animate-spin' : ''}`} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(prev => !prev)}
            className="h-7 w-7 p-0"
            title={isExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Preview Tab - iframe */}
      {activeTab === 'preview' && (
        <div className="flex-1 overflow-hidden">
          {previewUrl ? (
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={previewUrl}
              className="h-full w-full border-0"
              title="Preview"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-gray-500 dark:text-gray-400">
              <Globe className="mb-2 h-8 w-8" />
              <p>No preview URL available</p>
            </div>
          )}
        </div>
      )}

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Status header */}
          <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {loading.status ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : status?.running ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {status?.running ? 'Running' : 'Stopped'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchStatus}
                disabled={loading.status}
                className="h-6 px-2"
              >
                <RefreshCw className={`h-3 w-3 ${loading.status ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Service list */}
          {status?.services && status.services.length > 0 && (
            <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => selectService(null)}
                  className={`rounded px-2 py-1 text-xs ${
                    selectedService === null
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  All
                </button>
                {status.services.map(service => (
                  <button
                    key={service}
                    onClick={() => selectService(service)}
                    className={`rounded px-2 py-1 text-xs ${
                      selectedService === service
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {service}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="flex-1 overflow-hidden">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-1 dark:border-gray-700">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {selectedService ? `Logs: ${selectedService}` : 'All logs'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchLogs(selectedService || undefined)}
                  disabled={loading.logs}
                  className="h-5 px-1"
                >
                  <RefreshCw className={`h-3 w-3 ${loading.logs ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <pre className="flex-1 overflow-auto bg-gray-900 p-2 text-xs text-gray-100">
                {loading.logs ? 'Loading...' : logs || 'No logs available. Click refresh to load.'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
