export const BAG_CUSTOMIZE_SETTING_KEY = 'bag_customize_prompt';

/** One first-open prompt. Skip or finish marks it seen — not every later launch. */
export function shouldPromptBagCustomize(seen: string | null | undefined): boolean {
  return seen !== '1';
}

export function bagCustomizeSeenValue(): '1' {
  return '1';
}
