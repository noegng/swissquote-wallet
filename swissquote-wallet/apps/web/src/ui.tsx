// Briques d'interface communes, reprises de la maquette Figma « V3 App » : coque d'écran (barre de
// navigation, progression, pied collant), listes groupées, pastilles d'état, boutons.
// Aucune logique métier ici : uniquement de la présentation.
import type { ButtonHTMLAttributes, FormEventHandler, ReactNode } from 'react';

const ICONS = {
  chevL: <path d="m15 18-6-6 6-6" />,
  chevR: <path d="m9 18 6-6-6-6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  bank: (
    <>
      <path d="M3 22h18" />
      <path d="M6 18v-7" />
      <path d="M10 18v-7" />
      <path d="M14 18v-7" />
      <path d="M18 18v-7" />
      <path d="M12 2l8 5H4z" />
    </>
  ),
  key: (
    <>
      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
      <circle cx="16.5" cy="7.5" r=".5" />
    </>
  ),
  face: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </>
  ),
  up: (
    <>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </>
  ),
  down: (
    <>
      <path d="M17 7 7 17" />
      <path d="M17 17H7V7" />
    </>
  ),
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  alert: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="14" height="14" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  swap: (
    <>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </>
  ),
  lifebuoy: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.93 4.93 4.24 4.24" />
      <path d="m14.83 9.17 4.24-4.24" />
      <path d="m14.83 14.83 4.24 4.24" />
      <path d="m9.17 14.83-4.24 4.24" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" />
      <path d="M16 14h.01" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3z" />
      <path d="M21 14v.01" />
      <path d="M21 21v-3" />
      <path d="M14 21h3" />
    </>
  ),
  external: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Coque d'un écran : barre de navigation, progression, contenu défilant, pied collant. */
export function Screen({
  title,
  onBack,
  step,
  footer,
  tabs,
  onSubmit,
  children,
}: {
  /** Titre de la barre de navigation ; absent = pas de barre (accueil, résultats). */
  title?: string;
  onBack?: () => void;
  /** [étape en cours, nombre d'étapes] */
  step?: [number, number];
  footer?: ReactNode;
  /** Barre d'onglets du wallet : uniquement les sections qui existent dans l'app. */
  tabs?: { value: TabName; onChange: (tab: TabName) => void; badge?: TabName | null };
  /** Fourni : l'écran est un formulaire, le bouton principal du pied le soumet. */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  const content = (
    <>
      {title !== undefined && (
        <header className="nav">
          {onBack ? (
            <button type="button" className="nav-btn" onClick={onBack} aria-label="Back">
              <Icon name="chevL" size={24} />
            </button>
          ) : (
            <span className="nav-btn" />
          )}
          <h2>{title}</h2>
          <span className="nav-btn" />
        </header>
      )}
      {step && (
        <div className="steps" role="progressbar" aria-valuemin={1} aria-valuenow={step[0]} aria-valuemax={step[1]}>
          {Array.from({ length: step[1] }, (_, i) => (
            <i key={i} className={i < step[0] ? 'on' : undefined} />
          ))}
        </div>
      )}
      <div className="body">{children}</div>
      {footer && <footer className="footer">{footer}</footer>}
      {tabs && <TabBar {...tabs} />}
    </>
  );
  return onSubmit ? (
    <form className="screen" onSubmit={onSubmit}>
      {content}
    </form>
  ) : (
    <div className="screen">{content}</div>
  );
}

export type TabName = 'wallet' | 'transfers' | 'activity' | 'recovery';

const TABS: [TabName, IconName, string][] = [
  ['wallet', 'wallet', 'Wallet'],
  ['transfers', 'swap', 'Transfers'],
  ['activity', 'bell', 'Activity'],
  ['recovery', 'lifebuoy', 'Recovery'],
];

function TabBar({
  value,
  onChange,
  badge,
}: {
  value: TabName;
  onChange: (tab: TabName) => void;
  badge?: TabName | null;
}) {
  return (
    <nav className="tabbar" aria-label="Wallet sections">
      {TABS.map(([tab, icon, label]) => (
        <button
          key={tab}
          type="button"
          className={tab === value ? 'tab on' : 'tab'}
          aria-current={tab === value ? 'page' : undefined}
          aria-label={tab === badge ? `${label}, new alerts` : undefined}
          onClick={() => onChange(tab)}
        >
          <span className={tab === badge ? 'tab-icon badge' : 'tab-icon'}>
            <Icon name={icon} size={24} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

export function Title({ title, lead, center }: { title: string; lead?: ReactNode; center?: boolean }) {
  return (
    <div className={center ? 'title center' : 'title'}>
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}

export function Btn({
  kind = 'primary',
  icon,
  small,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: 'primary' | 'secondary' | 'text';
  icon?: IconName;
  small?: boolean;
}) {
  return (
    <button {...props} className={`btn ${kind}${small ? ' small' : ''}`}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export type Tone = 'success' | 'danger' | 'neutral' | 'accent';

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="group">
      {label && <h3 className="label">{label}</h3>}
      <div className="sheet">{children}</div>
    </section>
  );
}

export function Row({
  icon,
  iconTone,
  title,
  sub,
  value,
  valueTone,
  chip,
  trail,
  onClick,
  disabled,
  label,
}: {
  icon?: IconName;
  iconTone?: 'danger';
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  valueTone?: 'success';
  chip?: [string, Tone];
  trail?: IconName;
  onClick?: () => void;
  disabled?: boolean;
  /** Nom lu par un lecteur d’écran quand le contenu visible ne dit pas ce que fait la ligne. */
  label?: string;
}) {
  const content = (
    <>
      {icon && (
        <span className={iconTone ? `ico ${iconTone}` : 'ico'}>
          <Icon name={icon} />
        </span>
      )}
      <span className="txt">
        <span className="t">{title}</span>
        {sub && <span className="s">{sub}</span>}
      </span>
      {value && <span className={valueTone ? `val ${valueTone}` : 'val'}>{value}</span>}
      {chip && <Chip tone={chip[1]}>{chip[0]}</Chip>}
      {trail && (
        <span className="trail">
          <Icon name={trail} size={trail === 'chevR' ? 18 : 20} />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className="row" onClick={onClick} disabled={disabled} aria-label={label}>
      {content}
    </button>
  ) : (
    <div className="row">{content}</div>
  );
}

/** Ligne libellé / valeur (résumé d'un paiement). */
export function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="row kv">
      <span className="k">{k}</span>
      <span className="v">{children}</span>
    </div>
  );
}

export function Callout({
  tone = 'accent',
  title,
  children,
}: {
  tone?: 'accent' | 'danger';
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`callout ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name="alert" size={18} />
      <div className="callout-body">
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Hero({ tone }: { tone: 'success' | 'danger' }) {
  return (
    <div className="hero">
      <span className={`glyph ${tone}`}>
        <Icon name={tone === 'success' ? 'check' : 'x'} size={38} stroke={2.25} />
      </span>
    </div>
  );
}

export interface TimelineItem {
  state: 'done' | 'now' | 'todo';
  title: string;
  desc?: ReactNode;
  chip?: [string, Tone];
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="timeline">
      {items.map((it, i) => (
        <li key={it.title} className={`tl ${it.state}`}>
          <span className="rail">
            <span className="dot">{it.state === 'done' && <Icon name="check" size={14} stroke={3} />}</span>
            {i < items.length - 1 && <span className="line" />}
          </span>
          <span className="tx">
            <span className="t">{it.title}</span>
            {it.desc && <span className="s">{it.desc}</span>}
            {it.chip && <Chip tone={it.chip[1]}>{it.chip[0]}</Chip>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Journal d'une opération en plusieurs étapes (création, transfert) : une ligne cochée par étape. */
export function Checklist({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="checklist">
      {lines.map((l) => (
        <li key={l}>
          <Icon name="check" size={16} stroke={2.5} />
          {l}
        </li>
      ))}
    </ul>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          className={v === value ? 'on' : undefined}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Panneau sombre avec un compte à rebours (délai de sécurité). */
export function Countdown({
  caption,
  secondsLeft,
  total,
  footnote,
}: {
  caption: string;
  secondsLeft: number | null;
  /** Durée totale du délai, pour la jauge ; absente = pas de jauge. */
  total?: number;
  footnote: string;
}) {
  const done = total && secondsLeft !== null ? Math.min(1, Math.max(0, 1 - secondsLeft / total)) : null;
  return (
    <div className="countdown-card">
      <span className="cap">{caption}</span>
      <span className="time" aria-live="off">
        {secondsLeft === null ? '--:--' : formatClock(secondsLeft)}
      </span>
      <span className="cap">{footnote}</span>
      {done !== null && (
        <span className="track">
          <i style={{ width: `${Math.round(done * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function Brand({ large }: { large?: boolean }) {
  return (
    <span className={large ? 'brand large' : 'brand'}>
      {/* Symbole Swissquote, repris tel quel de swissquote.com (marque de Swissquote). */}
      <svg viewBox="0 0 35 35" aria-hidden="true">
        <path
          fill="currentColor"
          d="M17.5 0A17.5 17.5 0 1 1 0 17.5 17.396 17.396 0 0 1 17.5 0ZM8.694 10.124v3.048h17.613v-3.048H8.694Zm3.048 11.365c0-.94.226-1.505.602-1.881a2.183 2.183 0 0 1 3.011 0c.377.376.602.94.602 1.881v3.387h3.086V21.49c0-.94.226-1.505.602-1.881a2.182 2.182 0 0 1 3.011 0c.377.376.602.94.602 1.881v3.387h3.049v-8.919H8.694v8.92h3.048v-3.388Z"
        />
      </svg>
      Swissquote
    </span>
  );
}
