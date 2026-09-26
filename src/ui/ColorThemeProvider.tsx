import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useDb } from '@/src/db/DbProvider';
import { getColorTheme } from '@/src/db/repo';
import { DEFAULT_COLOR_THEME, type ColorThemeId } from '@/src/domain/colorTheme';
import { COLOR_THEMES, colors as defaultColors, type ColorPalette } from './theme';

type ColorThemeValue = {
  themeId: ColorThemeId;
  colors: ColorPalette;
};

const ColorThemeContext = createContext<ColorThemeValue>({
  themeId: DEFAULT_COLOR_THEME,
  colors: defaultColors,
});

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const { db, revision } = useDb();
  const value = useMemo<ColorThemeValue>(() => {
    const themeId = getColorTheme(db);
    return { themeId, colors: COLOR_THEMES[themeId] };
  }, [db, revision]);

  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

/** Re-themes a subtree. Play wraps its screen so shared widgets follow the
 * bright-sun high-contrast flip. Never writes the saved theme. */
export function ColorThemeOverride({ themeId, children }: { themeId: ColorThemeId; children: ReactNode }) {
  const value = useMemo<ColorThemeValue>(() => ({ themeId, colors: COLOR_THEMES[themeId] }), [themeId]);
  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

export function useColorTheme(): ColorThemeValue {
  return useContext(ColorThemeContext);
}

export function useColors(): ColorPalette {
  return useContext(ColorThemeContext).colors;
}
