import { CAR_COLORS, CAR_SHAPES, carSvg, type CarLook } from '../lib/car';
import { MAP_DESIGNS, type MapDesign } from '../lib/mapStyle';
import type { Theme } from '../hooks/useTheme';
import { BackIcon, CheckIcon, MoonIcon, SunIcon } from './icons';

interface Props {
  theme: Theme;
  /** Dark after sunset and light after sunrise, instead of the Dark mode switch. */
  autoTheme: boolean;
  /** Null when the free map is in use: it has only one design. */
  mapDesign: MapDesign | null;
  buildings3d: boolean;
  car: CarLook;
  leaving: 'pop' | 'fade' | null;
  onToggleTheme: () => void;
  onAutoTheme: (on: boolean) => void;
  onMapDesign: (design: MapDesign) => void;
  onBuildings3d: (on: boolean) => void;
  onCar: (car: CarLook) => void;
  onBack: () => void;
}

/** Everything about how OTW looks, opened from Account. */
export default function CustomiseScreen(p: Props) {
  const dark = p.theme === 'dark';

  return (
    <div className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to Account">
          <BackIcon />
        </button>
        <h1 className="page-title">Customise</h1>
      </div>

      <div className="page-body">
        <h2 className="section-label">Day and night</h2>
        <div className="card setting-row">
          <span className="row-icon tinted">
            <MoonIcon size={20} />
          </span>
          <span className="row-text">
            <span id="cus-dark" className="row-title">
              Dark mode
            </span>
            <span className="row-sub">{p.autoTheme ? 'Set by Auto day and night' : 'Easier on the eyes at night'}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-labelledby="cus-dark"
            className={`switch${dark ? ' is-on' : ''}`}
            disabled={p.autoTheme}
            onClick={p.onToggleTheme}
          >
            <span className="switch-knob" />
          </button>
        </div>
        <div className="card setting-row">
          <span className="row-icon tinted">
            <SunIcon size={20} />
          </span>
          <span className="row-text">
            <span id="cus-auto" className="row-title">
              Auto day and night
            </span>
            <span className="row-sub wrap">Dark after sunset, light after sunrise</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={p.autoTheme}
            aria-labelledby="cus-auto"
            className={`switch${p.autoTheme ? ' is-on' : ''}`}
            onClick={() => p.onAutoTheme(!p.autoTheme)}
          >
            <span className="switch-knob" />
          </button>
        </div>

        {p.mapDesign && (
          <>
            <h2 id="cus-map" className="section-label">
              Map style
            </h2>
            <div className="design-list" role="radiogroup" aria-labelledby="cus-map">
              {MAP_DESIGNS.map(({ value, label, hint }) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={p.mapDesign === value}
                  className={`design-row${p.mapDesign === value ? ' is-on' : ''}`}
                  onClick={() => p.onMapDesign(value)}
                >
                  <span className="row-text">
                    <span className="row-title">{label}</span>
                    <span className="row-sub wrap">{hint}</span>
                  </span>
                  {p.mapDesign === value && <CheckIcon size={20} />}
                </button>
              ))}
            </div>
          </>
        )}

        <h2 className="section-label">3D</h2>
        <div className="card setting-row">
          <span className="row-text">
            <span id="cus-3d" className="row-title">
              3D buildings
            </span>
            <span className="row-sub wrap">Buildings stand up while you drive through town</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={p.buildings3d}
            aria-labelledby="cus-3d"
            className={`switch${p.buildings3d ? ' is-on' : ''}`}
            onClick={() => p.onBuildings3d(!p.buildings3d)}
          >
            <span className="switch-knob" />
          </button>
        </div>

        <h2 id="cus-car" className="section-label">
          Your car
        </h2>
        <div className="card stack">
          <span className="row-sub wrap">Shown on the map while you drive</span>
          <div className="car-shapes" role="radiogroup" aria-labelledby="cus-car">
            {CAR_SHAPES.map(({ value, label }) => (
              <button
                type="button"
                key={value}
                role="radio"
                aria-checked={p.car.shape === value}
                className={`car-shape${p.car.shape === value ? ' is-on' : ''}`}
                onClick={() => p.onCar({ ...p.car, shape: value })}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{ fill: p.car.color }}
                  // Only our own drawings from car.ts.
                  dangerouslySetInnerHTML={{ __html: carSvg(value) }}
                />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="car-colors" role="radiogroup" aria-label="Car colour">
            {CAR_COLORS.map(({ value, label }) => (
              <button
                type="button"
                key={value}
                role="radio"
                aria-checked={p.car.color === value}
                aria-label={label}
                className={`car-color${p.car.color === value ? ' is-on' : ''}`}
                style={{ background: value }}
                onClick={() => p.onCar({ ...p.car, color: value })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
