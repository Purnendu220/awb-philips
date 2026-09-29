const PATHS: Record<string, string> = {
  sheet: 'M4 3h11l5 5v13H4zM14 3v6h6M8 13h8M8 17h8M8 9h3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  x: 'M6 6l12 12M18 6L6 18',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7h.01',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M5 12l5 5L20 7',
  plane: 'M2 16l20-8-6 13-3-6zM13 15l-3 5',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4',
  ship: 'M3 17l2 4h14l2-4M5 17V9h14v8M9 9V5h6v4',
  reset: 'M4 4v6h6M4.5 15a8 8 0 1 0 2-8.5L4 10',
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.file} />
    </svg>
  );
}
