/**
 * One-line score stepper for a partner: − score + and Save.
 *
 * The number starts at par (4 when par is unknown). Before Save, − / + move an
 * unsaved draft; Save stores what is shown. Once saved, − / + change the saved
 * score directly. A plain tap on Saved does nothing, so a stray tap never wipes
 * a score; clearing is a separate, confirmed action. Scores stay within 1–20.
 */

export const STEPPER_MIN = 1;
export const STEPPER_MAX = 20;
const UNKNOWN_PAR_START = 4;

export function clampStepperScore(n: number): number {
  return Math.min(STEPPER_MAX, Math.max(STEPPER_MIN, Math.round(n)));
}

/** The number the stepper shows: the saved score, else the draft, else par. */
export function stepperShown(saved: number | null, draft: number | null | undefined, par: number | null): number {
  return saved ?? draft ?? par ?? UNKNOWN_PAR_START;
}

export type StepperAction =
  | { kind: 'draft'; value: number }
  | { kind: 'save'; value: number }
  | { kind: 'clear' }
  | { kind: 'none' };

/** What a − or + tap does. */
export function stepperStep(
  saved: number | null,
  draft: number | null | undefined,
  par: number | null,
  delta: -1 | 1,
): StepperAction {
  const value = clampStepperScore(stepperShown(saved, draft, par) + delta);
  return saved != null ? { kind: 'save', value } : { kind: 'draft', value };
}

/** What a plain tap on Save / Saved does: saves the shown number, or nothing once saved. */
export function stepperToggle(saved: number | null, draft: number | null | undefined, par: number | null): StepperAction {
  return saved != null ? { kind: 'none' } : { kind: 'save', value: clampStepperScore(stepperShown(saved, draft, par)) };
}

/** The deliberate clear (press and hold Saved, then confirm). Nothing to clear before Save. */
export function stepperClear(saved: number | null): StepperAction {
  return saved != null ? { kind: 'clear' } : { kind: 'none' };
}
