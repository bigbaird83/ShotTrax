import type { ViewStyle } from 'react-native';
import type { ColorPalette } from './theme';

/**
 * Linear gradient fill (New Architecture `experimental_backgroundImage`).
 * `backgroundColor` stays as the fallback where gradients are not drawn (web).
 */
export function gradientFill(from: string, to: string, angleDeg = 135): ViewStyle {
  return {
    backgroundColor: from,
    experimental_backgroundImage: `linear-gradient(${angleDeg}deg, ${from}, ${to})`,
  } as ViewStyle;
}

/** Primary buttons and the Start 18 tile. High contrast stays flat. */
export function accentFill(colors: ColorPalette): ViewStyle {
  return colors.flat ? { backgroundColor: colors.lime } : gradientFill(colors.lime, colors.accent2);
}

/** Home hero and live-round card. */
export function heroFill(colors: ColorPalette): ViewStyle {
  return colors.flat
    ? { backgroundColor: colors.hero1, borderWidth: 2, borderColor: colors.line }
    : { ...gradientFill(colors.hero1, colors.hero2, 150), borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' };
}

export function dangerFill(colors: ColorPalette): ViewStyle {
  return colors.flat ? { backgroundColor: colors.red } : gradientFill(colors.red, colors.orange);
}

/** Soft colored glow under primary actions. None on high contrast. */
export function glow(colors: ColorPalette): ViewStyle {
  if (colors.flat) return {};
  return {
    shadowColor: colors.glow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  };
}

/** Card border: 1pt normally, 2pt on high contrast. */
export function cardBorder(colors: ColorPalette): ViewStyle {
  return { borderWidth: colors.flat ? 2 : 1, borderColor: colors.line };
}

/** Tinted square behind an icon (quick tiles, menu rows). */
export function tint(color: string, alpha = 0.2): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
