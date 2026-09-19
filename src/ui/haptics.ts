import * as Haptics from 'expo-haptics';

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // Haptics are best-effort (web / simulator without Taptic).
  }
}

export function hapticSelect(): void {
  void run(() => Haptics.selectionAsync());
}

export function hapticMark(): void {
  void run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticWarn(): void {
  void run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function hapticTap(): void {
  void run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Shot lock / hole change — light, not a success banner. */
export function hapticLight(): void {
  void run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}
