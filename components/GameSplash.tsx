import styles from './game-splash.module.css';

type Props = {
  name: string;
  src: string;
  background: string;
  progress: number;
  placeholder?: string;
};

export function GameSplash({ name, src, background, progress, placeholder }: Props) {
  const percent = Math.min(100, Math.max(0, progress));

  return (
    <div className={styles.splash} style={{ backgroundColor: background }}>
      <div
        className={styles.art}
        style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} fetchPriority="high" draggable={false} />
      </div>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label={`Loading ${name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className={styles.track}>
          <span className={styles.fill} style={{ width: `${percent}%` }} />
        </span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}
