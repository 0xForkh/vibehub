import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

interface CodeBlockProps {
  children: React.ReactNode;
}

export function CodeBlock({ children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    // Extract text content from children
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node;
      if (typeof node === 'number') return String(node);
      if (Array.isArray(node)) return node.map(extractText).join('');
      if (node && typeof node === 'object' && 'props' in node) {
        const element = node as React.ReactElement<{ children?: React.ReactNode }>;
        return extractText(element.props.children);
      }
      return '';
    };

    const text = extractText(children);
    const success = await copyToClipboard(text);

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded bg-gray-100 p-2 dark:bg-gray-800">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded bg-gray-200 p-1.5 opacity-0 transition-opacity hover:bg-gray-300 group-hover:opacity-100 dark:bg-gray-700 dark:hover:bg-gray-600"
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
        ) : (
          <Copy className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        )}
      </button>
    </div>
  );
}
