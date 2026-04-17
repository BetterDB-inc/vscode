import styles from '../styles.module.css';
import { GeoValue } from '../../../shared/types';

interface Props { value: GeoValue; onChange: (v: GeoValue) => void; }

export function GeoField({ value, onChange }: Props) {
  const num = (s: string) => {
    if (s === '') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  };
  return (
    <div>
      <input className={styles.input} type="number" placeholder="lon" aria-label="longitude"
             value={value.lon ?? ''} onChange={(e) => onChange({ ...value, lon: num(e.target.value) })} />
      <input className={styles.input} type="number" placeholder="lat" aria-label="latitude"
             value={value.lat ?? ''} onChange={(e) => onChange({ ...value, lat: num(e.target.value) })} />
      <input className={styles.input} type="number" placeholder="radius" aria-label="radius" min={0}
             value={value.radius ?? ''} onChange={(e) => onChange({ ...value, radius: num(e.target.value) })} />
      <select className={styles.select} value={value.unit}
              onChange={(e) => onChange({ ...value, unit: e.target.value as GeoValue['unit'] })}>
        <option value="km">km</option><option value="m">m</option>
        <option value="mi">mi</option><option value="ft">ft</option>
      </select>
    </div>
  );
}
