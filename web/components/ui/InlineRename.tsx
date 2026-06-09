import { useEffect, useRef } from "react";

interface InlineRenameProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
  focusDelayMs?: number;
  confirmOnBlur?: boolean;
  confirmOnOutsidePointerDown?: boolean;
}

export default function InlineRename({
  value,
  onChange,
  onConfirm,
  onCancel,
  className,
  style,
  focusDelayMs = 50,
  confirmOnBlur = true,
  confirmOnOutsidePointerDown = false,
}: InlineRenameProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onConfirmRef = useRef(onConfirm);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  useEffect(() => {
    const initialValue = value;
    const timer = window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (input.value === initialValue) {
        input.select();
      }
    }, focusDelayMs);
    return () => window.clearTimeout(timer);
  }, [focusDelayMs, value]);

  useEffect(() => {
    if (!confirmOnOutsidePointerDown) return;

    function handlePointerDown(event: PointerEvent) {
      const input = inputRef.current;
      const target = event.target;
      if (!input || !(target instanceof Node) || input.contains(target)) return;
      onConfirmRef.current();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [confirmOnOutsidePointerDown]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      style={style}
      onBlur={confirmOnBlur ? onConfirm : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter") onConfirm();
        if (event.key === "Escape") onCancel();
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}
