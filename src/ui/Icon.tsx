import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

/** SF Symbol with a text glyph where symbols are not drawn (Android / web). */
export function Icon({
  name,
  color,
  size = 22,
  glyph,
}: {
  name: SymbolName;
  color: string;
  size?: number;
  glyph: string;
}) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      fallback={<Text style={{ color, fontSize: size * 0.8, fontWeight: '800' }}>{glyph}</Text>}
    />
  );
}
