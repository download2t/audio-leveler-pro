const PATHS = {
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderOpen: 'M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h12l4-8H7l-4 8',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  x: 'M6 6l12 12M18 6L6 18',
  sun: 'M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6L19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4L19 5M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-4-4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  wave: 'M2 12h2M6 8v8M10 4v16M14 7v10M18 10v4M22 12h-2',
  log: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0M21 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  film: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
  scissors: 'M6 9a3 3 0 1 0 0-6a3 3 0 1 0 0 6M6 21a3 3 0 1 0 0-6a3 3 0 1 0 0 6M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.7H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10.3 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  top: 'M5 4h14M12 20V9M6 14l6-6 6 6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  image: 'M3 4h18v16H3zM8.5 10a1.5 1.5 0 1 0 0-3a1.5 1.5 0 1 0 0 3M21 15l-5-5L5 20',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  merge: 'M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6V3M12 15v6',
  split: 'M12 3v6M12 9l-6 6v6M12 9l6 6v6',
  volume: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  speed: 'M12 13a1 1 0 1 0 0-2a1 1 0 1 0 0 2M13 12l5-5M4 18a10 10 0 1 1 16 0',
  rotate: 'M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.6L21 8M21 3v5h-5',
  flip: 'M12 3v18M16 7l4 5-4 5zM8 7L4 12l4 5z',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7h.01',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z',
  fade: 'M3 20L21 4M3 20h18',
  silence: 'M3 12h4M17 12h4M9 8v8M15 8v8',
  minus: 'M5 12h14'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
