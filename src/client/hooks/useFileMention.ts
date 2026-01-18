import { useState, useEffect, useCallback, useRef } from 'react';

export interface FileMention {
  name: string;  // Display name (filename only)
  path: string;  // Full relative path for Claude
}

interface UseFileMentionOptions {
  workingDir?: string;
  enabled?: boolean;
}

interface UseFileMentionResult {
  // State
  showMenu: boolean;
  searchQuery: string;
  suggestions: FileMention[];
  selectedIndex: number;
  loading: boolean;
  mentionStartIndex: number | null;

  // Actions
  handleInputChange: (value: string, cursorPosition: number) => void;
  selectSuggestion: (file: FileMention) => { newValue: string; newCursorPosition: number };
  navigateUp: () => void;
  navigateDown: () => void;
  closeMenu: () => void;
  resetState: () => void;
}

export function useFileMention({
  workingDir,
  enabled = true,
}: UseFileMentionOptions): UseFileMentionResult {
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FileMention[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentValueRef = useRef<string>('');

  // Debounced file search
  const searchFiles = useCallback(
    async (query: string) => {
      if (!workingDir || query.length < 2) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          path: workingDir,
          query,
          limit: '15',
        });
        const response = await fetch(`/api/files/search?${params}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.files || []);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [workingDir]
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

      if (!enabled || !workingDir) {
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
          searchFiles(query);
        }, 150);
      } else {
        setShowMenu(false);
        setSearchQuery('');
        setMentionStartIndex(null);
        setSuggestions([]);
      }
    },
    [enabled, workingDir, searchFiles]
  );

  const selectSuggestion = useCallback(
    (file: FileMention): { newValue: string; newCursorPosition: number } => {
      if (mentionStartIndex === null) {
        return { newValue: currentValueRef.current, newCursorPosition: currentValueRef.current.length };
      }

      const value = currentValueRef.current;
      const beforeMention = value.slice(0, mentionStartIndex);
      const afterMention = value.slice(mentionStartIndex + 1 + searchQuery.length);

      // Insert the mention - we use a special format: @[filename](path)
      // This will be displayed as a chip in the UI and converted to full path when sending
      const mentionText = `@[${file.name}](${file.path})`;
      const newValue = `${beforeMention + mentionText  } ${  afterMention}`;
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
 * Parse file mentions from text and return processed content
 * Converts @[filename](path) to just the path for Claude
 */
export function parseFileMentions(text: string): string {
  // Replace @[filename](path) with just the full path
  return text.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_, _name, path) => path);
}

/**
 * Extract mentions from text for display purposes
 */
export function extractMentions(text: string): { name: string; path: string; start: number; end: number }[] {
  const mentions: { name: string; path: string; start: number; end: number }[] = [];
  const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let match = regex.exec(text);

  while (match !== null) {
    mentions.push({
      name: match[1],
      path: match[2],
      start: match.index,
      end: match.index + match[0].length,
    });
    match = regex.exec(text);
  }

  return mentions;
}
