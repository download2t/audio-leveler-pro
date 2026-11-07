import { useEffect, useRef, useState } from 'react';

/** Window-wide drag & drop of files/folders. Returns whether something is being dragged over. */
export function useFileDrop(onPaths: (paths: string[]) => void, enabled: boolean): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const callback = useRef(onPaths);
  callback.current = onPaths;

  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      if (enabled) setDragging(true);
    };
    const onOver = (e: DragEvent): void => {
      // Always prevent default so a drop never navigates the window to the file.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
    };
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (!enabled || !e.dataTransfer) return;
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => window.api.getPathForFile(f))
        .filter(Boolean);
      if (paths.length) callback.current(paths);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [enabled]);

  return dragging;
}
