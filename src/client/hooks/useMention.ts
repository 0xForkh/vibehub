import { useState, useEffect, useCallback, useRef } from 'react';

export type MentionType = 'file' | 'session';

export interface MentionItem {
  type: MentionType;
  name: string;  // Display name
  value: string; // Full value for insertion (path for files, id for sessions)
  description?: string; // Secondary info (full path for files, session details for sessions)
}

interface UseMentionOptions {
  workingDir?: string;
  sessions?: Array<{ id: string; name: string; type: string }>;
  enabled?: boolean;
}

interface UseMentionResult {
  // State
  showMenu: boolean;
  searchQuery: string;
  suggestions: MentionItem[];
  selectedIndex: number;
  loading: boolean;
  mentionStartIndex: number | null;

  // Actions
  handleInputChange: (value: string, cursorPosition: number) => void;
  selectSuggestion: (item: MentionItem) => { newValue: string; newCursorPosition: number };
  navigateUp: () => void;
  navigateDown: () => void;
  closeMenu: () => void;
  resetState: () => void;
}

export function useMention({
  workingDir,
  sessions = [],
  enabled = true,
}: UseMentionOptions): UseMentionResult {
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<MentionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentValueRef = useRef<string>('');

  // Search files from server
  const searchFiles = useCallback(
    async (query: string): Promise<MentionItem[]> => {
      if (!workingDir || query.length < 2) {
        return [];
      }

      try {
        const params = new URLSearchParams({
          path: workingDir,
          query,
          limit: '10',
        });
        const response = await fetch(`/api/files/search?${params}`);
        if (response.ok) {
          const data = await response.json();
          return (data.files || []).map((file: { name: string; path: string }) => ({
            type: 'file' as MentionType,
            name: file.name,
            value: file.path,
            description: file.path,
          }));
        }
      } catch {
        // Ignore errors
      }
      return [];
    },
    [workingDir]
  );

  // Search sessions (local filter)
  const searchSessions = useCallback(
    (query: string): MentionItem[] => {
      if (query.length < 1) {
        // Show all sessions if no query
        return sessions
          .filter((s) => s.type === 'claude')
          .slice(0, 5)
          .map((session) => ({
            type: 'session' as MentionType,
            name: session.name,
            value: session.id,
            description: `Session ID: ${session.id.slice(0, 8)}...`,
          }));
      }

      const lowerQuery = query.toLowerCase();
      return sessions
        .filter((s) => s.type === 'claude')
        .filter(
          (session) =>
            session.name.toLowerCase().includes(lowerQuery) ||
            session.id.toLowerCase().includes(lowerQuery)
        )
        .slice(0, 5)
        .map((session) => ({
          type: 'session' as MentionType,
          name: session.name,
          value: session.id,
          description: `Session ID: ${session.id.slice(0, 8)}...`,
        }));
    },
    [sessions]
  );

  // Combined search
  const performSearch = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        // Search both files and sessions in parallel
        const [fileResults, sessionResults] = await Promise.all([
          searchFiles(query),
          Promise.resolve(searchSessions(query)),
        ]);

        // Combine results: sessions first, then files
        const combined = [...sessionResults, ...fileResults];
        setSuggestions(combined);
      } finally {
        setLoading(false);
      }
    },
    [searchFiles, searchSessions]
  );

  // Cleanup timeout on unmount
  useEffect(() => () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    }, []);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  const handleInputChange = useCallback(
    (value: string, cursorPosition: number) => {
      currentValueRef.current = value;

      if (!enabled) {
        setShowMenu(false);
        return;
      }

      // Find if we're in an @ mention context
      // Look backwards from cursor for @ that isn't preceded by a word char
      const textBeforeCursor = value.slice(0, cursorPosition);
      const mentionMatch = textBeforeCursor.match(/@([^\s@]*)$/);

      if (mentionMatch) {
        const query = mentionMatch[1];
        const startIdx = cursorPosition - query.length - 1; // -1 for @

        setMentionStartIndex(startIdx);
        setSearchQuery(query);
        setShowMenu(true);

        // Debounce search
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }
        searchTimeoutRef.current = setTimeout(() => {
          performSearch(query);
        }, 150);
      } else {
        setShowMenu(false);
        setSearchQuery('');
        setMentionStartIndex(null);
        setSuggestions([]);
      }
    },
    [enabled, performSearch]
  );

  const selectSuggestion = useCallback(
    (item: MentionItem): { newValue: string; newCursorPosition: number } => {
      if (mentionStartIndex === null) {
        return { newValue: currentValueRef.current, newCursorPosition: currentValueRef.current.length };
      }

      const value = currentValueRef.current;
      const beforeMention = value.slice(0, mentionStartIndex);
      const afterMention = value.slice(mentionStartIndex + 1 + searchQuery.length);

      // Insert the mention with type-specific format
      // Files: @[filename](file:path)
      // Sessions: @[sessionname](session:id)
      const prefix = item.type === 'session' ? 'session' : 'file';
      const mentionText = `@[${item.name}](${prefix}:${item.value})`;
      const newValue = `${beforeMention + mentionText} ${afterMention}`;
      const newCursorPosition = beforeMention.length + mentionText.length + 1;

      // Reset state
      setShowMenu(false);
      setSearchQuery('');
      setMentionStartIndex(null);
      setSuggestions([]);

      return { newValue, newCursorPosition };
    },
    [mentionStartIndex, searchQuery]
  );

  const navigateUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
  }, []);

  const navigateDown = useCallback(() => {
    setSelectedIndex((prev) =>
      prev < suggestions.length - 1 ? prev + 1 : prev
    );
  }, [suggestions.length]);

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setSearchQuery('');
    setMentionStartIndex(null);
    setSuggestions([]);
  }, []);

  const resetState = useCallback(() => {
    setShowMenu(false);
    setSearchQuery('');
    setSuggestions([]);
    setSelectedIndex(0);
    setMentionStartIndex(null);
    currentValueRef.current = '';
  }, []);

  return {
    showMenu,
    searchQuery,
    suggestions,
    selectedIndex,
    loading,
    mentionStartIndex,
    handleInputChange,
    selectSuggestion,
    navigateUp,
    navigateDown,
    closeMenu,
    resetState,
  };
}

/**
 * Parse mentions from text and return processed content
 * Converts @[name](type:value) to appropriate format for Claude:
 * - Files: returns the path
 * - Sessions: returns "Session 'name' (ID: id)"
 */
export function parseMentions(text: string): string {
  return text.replace(/@\[([^\]]+)\]\((file|session):([^)]+)\)/g, (_, name, type, value) => {
    if (type === 'session') {
      return `[Session "${name}" (ID: ${value})]`;
    }
    // File: return the path
    return value;
  });
}

/**
 * Legacy parser for backward compatibility with old file-only mentions
 */
export function parseFileMentions(text: string): string {
  // First handle new format
  let result = parseMentions(text);
  // Then handle old format @[filename](path) without type prefix
  result = result.replace(/@\[([^\]]+)\]\(([^:)][^)]*)\)/g, (_, _name, path) => path);
  return result;
}

/**
 * Extract mentions from text for display purposes
 */
export function extractMentions(text: string): { type: MentionType; name: string; value: string; start: number; end: number }[] {
  const mentions: { type: MentionType; name: string; value: string; start: number; end: number }[] = [];
  const regex = /@\[([^\]]+)\]\((file|session):([^)]+)\)/g;
  let match = regex.exec(text);

  while (match !== null) {
    mentions.push({
      type: match[2] as MentionType,
      name: match[1],
      value: match[3],
      start: match.index,
      end: match.index + match[0].length,
    });
    match = regex.exec(text);
  }

  return mentions;
}
