import { unavailableAmbientLight, type AmbientLightReading } from '../domain/playTheme';

/**
 * iPhone does not expose a public lux API, and messy camera/screen proxies stay parked.
 * A good reading can be injected later; until then high-contrast is Settings-only.
 */
export function readAmbientLight(): AmbientLightReading {
  return unavailableAmbientLight();
}
