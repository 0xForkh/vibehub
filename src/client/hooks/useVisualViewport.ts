import { useState, useEffect } from 'react';

interface VisualViewportState {
  height: number | null;
  offsetTop: number;
}

/**
 * Tracks the visual viewport to handle mobile keyboard.
 * Returns height and offset for proper positioning when keyboard opens.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({
    height: null,
    offsetTop: 0,
  });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const update = () => {
      setState({
        height: viewport.height,
        offsetTop: viewport.offsetTop,
      });
    };

    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return state;
}
