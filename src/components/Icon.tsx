type IconName =
  | 'search' | 'plus' | 'x' | 'download' | 'upload' | 'clock' | 'settings'
  | 'star' | 'pin' | 'moon' | 'sun' | 'columns' | 'play' | 'pause' | 'skip'
  | 'check' | 'chevronDown' | 'chevronRight' | 'target' | 'activity'
  | 'list' | 'file' | 'archive' | 'trash' | 'flame' | 'timer' | 'folder'
  | 'paperclip' | 'zap' | 'grip' | 'rotate' | 'edit' | 'sliders'

interface Props {
  name: IconName
  size?: number
  stroke?: number
  className?: string
}

export function Icon({ name, size = 16, stroke = 1.75, className }: Props) {
  const props = {
    width: size, height: size,
    viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className,
  }
  const paths: Record<IconName, JSX.Element> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    x: <path d="M18 6 6 18M6 6l12 12"/>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    star: <path d="M12 2 15 9l7 .6-5.3 4.7L18 22l-6-3.5L6 22l1.4-7.7L2 9.6 9 9z"/>,
    pin: <><path d="M12 17v5"/><path d="M9 11V4h6v7l3 3v2H6v-2z"/></>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7M5.6 18.4l.7-.7m11.4-11.4.7-.7"/></>,
    columns: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></>,
    play: <path d="m6 4 14 8-14 8z"/>,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>,
    skip: <><path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/></>,
    check: <path d="m5 12 5 5L20 7"/>,
    chevronDown: <path d="m6 9 6 6 6-6"/>,
    chevronRight: <path d="m9 6 6 6-6 6"/>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    activity: <path d="M22 12h-4l-3 9-6-18-3 9H2"/>,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    archive: <><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m6 6 1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></>,
    flame: <path d="M8.5 14.5C8.5 17 10 19 12 19s3.5-2 3.5-4.5c0-1.7-1-3-2-4-.5-.5-1-1.5-1-2.5 0-1 .5-2 1.5-3-2 .5-5 3-5 6.5 0 1 .5 2 0 3z"/>,
    timer: <><path d="M10 2h4"/><path d="M12 14v-4"/><circle cx="12" cy="14" r="8"/></>,
    folder: <path d="M4 4h5l2 2h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>,
    paperclip: <path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>,
    zap: <path d="M13 2 3 14h7l-1 8 10-12h-7z"/>,
    grip: <><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></>,
    rotate: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></>,
    sliders: <><path d="M4 21V14"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/></>,
  }
  return <svg {...props}>{paths[name]}</svg>
}
