// Iconografía SVG propia — sustituye a los emojis (📁📷🔬…), que se renderizan
// distinto en cada plataforma y desentonan en una herramienta clínica.
// Trazos geométricos uniformes: stroke 1.8, esquinas y puntas redondeadas,
// color heredado (currentColor) para que respeten el estado del botón.

export type IconName =
  | 'folder' | 'camera' | 'sparkles' | 'check' | 'pencil' | 'flask' | 'dataset'
  | 'download' | 'fileText'
  | 'point' | 'line' | 'angle' | 'ruler' | 'diamond' | 'arrowsH' | 'eraser' | 'undo'
  | 'magnifier' | 'magnet' | 'ghost'
  | 'eye' | 'eyeOff' | 'layers' | 'flip' | 'trash' | 'save' | 'move' | 'photo'
  | 'sun' | 'moon';

const PATHS: Record<IconName, React.ReactNode> = {
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 4l1.6 4.1 4.1 1.6-4.1 1.6L11 15.4 9.4 11.3 5.3 9.7l4.1-1.6z" />
      <path d="M18 14l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5L19.5 6.5" />,
  pencil: <path d="M4.5 19.5l3.8-.9L19.6 7.3a2 2 0 0 0-2.9-2.9L5.4 15.7z" />,
  flask: (
    <>
      <path d="M10 3.5v5.6l-4.9 8.8A1.8 1.8 0 0 0 6.7 20.5h10.6a1.8 1.8 0 0 0 1.6-2.6L14 9.1V3.5" />
      <path d="M8.4 3.5h7.2M7.5 15.5h9" />
    </>
  ),
  dataset: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.2" />
      <rect x="13" y="4" width="7" height="7" rx="1.2" />
      <rect x="4" y="13" width="7" height="7" rx="1.2" />
      <rect x="13" y="13" width="7" height="7" rx="1.2" />
    </>
  ),
  download: <path d="M12 4v11m-5.5-4.5L12 16l5.5-5.5M4.5 20h15" />,
  fileText: (
    <>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9.5 13.5h5.5M9.5 16.5h5.5" />
    </>
  ),
  point: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  line: (
    <>
      <path d="M6.5 17.5L17.5 6.5" />
      <circle cx="5.5" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="5.5" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  angle: (
    <>
      <path d="M5 19h14M5 19L15.5 6.5" />
      <path d="M10.8 19a7.5 7.5 0 0 0-1.7-4.6" />
    </>
  ),
  ruler: (
    <>
      <rect x="3" y="9.5" width="18" height="5.5" rx="1" />
      <path d="M7 9.5v2.4M11 9.5v3M15 9.5v2.4" />
    </>
  ),
  diamond: <path d="M12 4.5l6.8 7.5-6.8 7.5L5.2 12z" />,
  arrowsH: <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />,
  eraser: (
    <>
      <path d="M4.5 15l8-8.5a1.6 1.6 0 0 1 2.3 0l3.7 3.7a1.6 1.6 0 0 1 0 2.3L12 19H8.3z" />
      <path d="M8 19.5h12" />
    </>
  ),
  undo: (
    <>
      <path d="M8 5.5L3.5 10 8 14.5" />
      <path d="M3.5 10H14a5.5 5.5 0 1 1 0 11h-3" />
    </>
  ),
  magnifier: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>
  ),
  magnet: (
    <>
      <path d="M6.5 3.5v8a5.5 5.5 0 0 0 11 0v-8" />
      <path d="M6.5 8h4.2M13.3 8h4.2" />
    </>
  ),
  ghost: (
    <>
      <path d="M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5l-2.2-1.8-2.1 1.8-2.2-1.8-2.2 1.8-2.1-1.8z" />
      <circle cx="9.7" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.3" cy="11" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3.5 3.5l17 17" />
      <path d="M9.9 5.8A10.4 10.4 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17.7 17.7 0 0 1-2.4 3.2" />
      <path d="M6.5 6.7C4 8.3 2 12 2 12s3.6 6.5 10 6.5a10 10 0 0 0 3.5-.6" />
      <path d="M9.8 9.9a2.6 2.6 0 0 0 3.5 3.6" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5z" />
      <path d="M3 12l9 4.5L21 12" />
      <path d="M3 16l9 4.5L21 16" />
    </>
  ),
  flip: (
    <>
      <path d="M12 3.5v17" />
      <path d="M8.5 7.5 4 12l4.5 4.5v-9z" />
      <path d="M15.5 7.5 20 12l-4.5 4.5v-9z" />
    </>
  ),
  trash: (
    <path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13" />
  ),
  save: (
    <>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v5h7V3" />
      <path d="M8 21v-6h8v6" />
    </>
  ),
  move: (
    <path d="M12 3v18M3 12h18M9.5 5.5 12 3l2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5" />
  ),
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="M4 17.5l4.5-3.8 3.5 2.6 3-2 5 3.7" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ),
  moon: (
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z" />
  ),
};

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
