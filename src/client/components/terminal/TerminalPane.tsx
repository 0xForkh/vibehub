import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { Circle, Terminal as TerminalIcon } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';
import { useTerminalSettings } from '../../hooks/useTerminalSettings';
import { FlowControlClient } from '../../vibehub/flowcontrol';
import { ResizablePanel } from '../ui/ResizablePanel';

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
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const initializedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
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
    if (!terminalRef.current) return;

    initializedRef.current = true;

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

    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

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

    term.onData((data) => {
      socket.emit('input', data);
    });

    const handleMouseUp = (e: MouseEvent) => {
      if (!e.shiftKey) return;
      const selection = term.getSelection();
      if (!selection) return;
      try {
        navigator.clipboard?.writeText(selection);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };

    const termEl = terminalRef.current;
    termEl.addEventListener('mouseup', handleMouseUp);

    resizeObserverRef.current = new ResizeObserver(() => {
      if (fitAddonRef.current && terminalInstanceRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalInstanceRef.current;
        socketRef.current?.emit('resize', { cols, rows });
      }
    });

    resizeObserverRef.current.observe(termEl);

    return () => {
      resizeObserverRef.current?.disconnect();
      termEl.removeEventListener('mouseup', handleMouseUp);
      socket.disconnect();
      term.dispose();
      initializedRef.current = false;
    };
  }, [isOpen, sessionId, fontSize]);

  // Update font size dynamically
  useEffect(() => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.options.fontSize = fontSize;
      setTimeout(refitTerminal, 0);
    }
  }, [fontSize, refitTerminal]);

  // Focus terminal when opened
  useEffect(() => {
    if (isOpen && terminalInstanceRef.current) {
      terminalInstanceRef.current.focus();
    }
  }, [isOpen]);

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

  return (
    <ResizablePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Terminal"
      icon={<TerminalIcon className="h-4 w-4" />}
      statusIndicator={
        <Circle className={`h-2 w-2 fill-current ${isConnected ? 'text-green-500' : 'text-gray-500'}`} />
      }
      defaultHeight={250}
      minHeight={150}
      maxHeight={500}
      storageKey="terminal"
    >
      <div
        ref={terminalRef}
        className="h-full w-full"
        style={{ background: '#0a0a0a' }}
      />
    </ResizablePanel>
  );
}
