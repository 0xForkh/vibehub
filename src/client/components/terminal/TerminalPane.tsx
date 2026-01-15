import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { X, Circle, Terminal as TerminalIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';
import { useTerminalSettings } from '../../hooks/useTerminalSettings';
import { FlowControlClient } from '../../vibehub/flowcontrol';
import { Button } from '../ui/button';

interface TerminalPaneProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TerminalPane({
  sessionId,
  isOpen,
  onClose,
}: TerminalPaneProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const initializedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const { fontSize } = useTerminalSettings();

  // Refit terminal helper
  const refitTerminal = useCallback(() => {
    if (fitAddonRef.current && terminalInstanceRef.current && socketRef.current?.connected) {
      fitAddonRef.current.fit();
      const { cols, rows } = terminalInstanceRef.current;
      socketRef.current.emit('resize', { cols, rows });
    }
  }, []);

  // Initialize terminal only once when first opened
  useEffect(() => {
    if (!isOpen || initializedRef.current) return;
    // Wait for refs to be available
    if (!terminalRef.current || !containerRef.current) return;

    initializedRef.current = true;

    // Initialize terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e4',
        cursor: '#3b82f6',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#ffffff',
        brightBlack: '#6b7280',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f9fafb',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    terminalInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to socket
    const socket = io({
      path: '/socket.io',
    });

    socketRef.current = socket;

    // Flow control
    const fcClient = new FlowControlClient();

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('session:attach', { sessionId });
    });

    socket.on('data', (data: string) => {
      if (fcClient.needsCommit(data.length)) {
        term.write(data, () => socket.emit('commit', fcClient.ackBytes));
      } else {
        term.write(data);
      }
    });

    socket.on('login', () => {
      // Small delay to ensure container is laid out
      setTimeout(() => {
        fitAddon.fit();
        const { cols, rows } = term;
        socket.emit('resize', { cols, rows });
      }, 50);
    });

    socket.on('logout', () => {
      term.write('\r\n\r\n[Session ended]\r\n');
      setIsConnected(false);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      term.write('\r\n\r\n[Disconnected from server]\r\n');
    });

    socket.on('error', (err: { message: string }) => {
      term.write(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
    });

    // Send terminal input to server
    term.onData((data) => {
      socket.emit('input', data);
    });

    // Auto-copy on Shift+mouseup
    const handleMouseUp = (e: MouseEvent) => {
      if (!e.shiftKey) return;
      const selection = term.getSelection();
      if (!selection) return;
      try {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(selection);
        }
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };

    const termEl = terminalRef.current;
    termEl.addEventListener('mouseup', handleMouseUp);

    // Handle container resize
    resizeObserverRef.current = new ResizeObserver(() => {
      if (fitAddonRef.current && terminalInstanceRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalInstanceRef.current;
        socketRef.current?.emit('resize', { cols, rows });
      }
    });

    resizeObserverRef.current.observe(containerRef.current);

    // Cleanup on unmount
    return () => {
      resizeObserverRef.current?.disconnect();
      termEl.removeEventListener('mouseup', handleMouseUp);
      socket.disconnect();
      term.dispose();
      initializedRef.current = false;
    };
  }, [isOpen, sessionId, fontSize]);

  // Refit when minimized state changes
  useEffect(() => {
    if (!isMinimized && initializedRef.current) {
      setTimeout(refitTerminal, 50);
    }
  }, [isMinimized, refitTerminal]);

  // Update font size dynamically
  useEffect(() => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.options.fontSize = fontSize;
      setTimeout(refitTerminal, 0);
    }
  }, [fontSize, refitTerminal]);

  // Focus terminal when expanded
  useEffect(() => {
    if (isOpen && !isMinimized && terminalInstanceRef.current) {
      terminalInstanceRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const handleClose = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('detach');
      socketRef.current.disconnect();
    }
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose();
      terminalInstanceRef.current = null;
    }
    resizeObserverRef.current?.disconnect();
    initializedRef.current = false;
    setIsConnected(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col border-t border-gray-200 bg-gray-900 dark:border-gray-700 ${
        isMinimized ? '' : 'max-h-[50vh] sm:max-h-[300px]'
      }`}
    >
      {/* Header - always visible */}
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-1.5">
        <button
          onClick={() => setIsMinimized(prev => !prev)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200"
        >
          <TerminalIcon className="h-4 w-4" />
          <span className="font-medium">Terminal</span>
          <Circle className={`h-2 w-2 fill-current ${isConnected ? 'text-green-500' : 'text-gray-500'}`} />
          {isMinimized ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
          title="Close"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Terminal area - hidden when minimized but stays mounted */}
      <div
        ref={terminalRef}
        className={`flex-1 overflow-hidden ${isMinimized ? 'hidden' : ''}`}
        style={{ minHeight: isMinimized ? 0 : '200px', background: '#0a0a0a' }}
      />
    </div>
  );
}
