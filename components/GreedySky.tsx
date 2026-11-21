import styles from './greedy-sky.module.css';

const clouds = [
  { image: 'cloud1.webp', style: styles.highCloud },
  { image: 'cloud2.webp', style: styles.middleCloud },
  { image: 'cloud1.webp', style: styles.lowCloud },
];

export function GreedySky() {
  return (
    <div className={styles.sky} aria-hidden="true">
      {clouds.map(({ image, style }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={style}
          src={`/greedy-lion/${image}`}
          alt=""
          className={`${styles.cloud} ${style}`}
          draggable={false}
        />
      ))}
    </div>
  );
}
