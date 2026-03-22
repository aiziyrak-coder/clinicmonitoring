import { useEffect, useRef } from 'react';

let bodyScrollLockCount = 0;

function lockBodyScroll() {
  bodyScrollLockCount++;
  if (bodyScrollLockCount === 1) {
    document.body.style.overflow = 'hidden';
  }
}

function unlockBodyScroll() {
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount === 0) {
    document.body.style.overflow = '';
  }
}

/**
 * Closes modal on Escape and locks body scroll while open (supports stacked modals).
 * Uses a ref so the latest `onClose` is always called without re-subscribing on every render.
 */
export function useModalDismiss(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    lockBodyScroll();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      unlockBodyScroll();
    };
  }, [isOpen]);
}
