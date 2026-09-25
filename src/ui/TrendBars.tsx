import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTrendValue, trendScale, type TrendSeries } from '@/src/domain/trends';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

const PLOT_HEIGHT = 132;
const MIN_BAR = 3;

/**
 * One series, one bar per round (oldest → newest). Bars grow from the zero line;
 * negatives hang below it. A thin line marks the window average.
 * Tap a bar for its round and value; "Show numbers" lists every value.
 */
export function TrendBars({ series, testID }: { series: TrendSeries; testID?: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selected, setSelected] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const values = series.points.map((point) => point.value);
  const { max, min } = trendScale(values);
  const span = max - min;
  const zeroTop = (max / span) * PLOT_HEIGHT;
  const px = (value: number) => Math.max(MIN_BAR, (Math.abs(value) / span) * PLOT_HEIGHT);
  const signed = series.id === 'toPar';
  const pick = selected != null ? series.points[selected] : null;
  const avgTop =
    series.average != null ? zeroTop - (series.average / span) * PLOT_HEIGHT : null;

  return (
    <View testID={testID} style={styles.wrap}>
      <Text style={styles.readout} numberOfLines={1}>
        {pick
          ? `${pick.label} · ${pick.courseName} · ${formatTrendValue(pick.value, series.unit, signed)}${pick.scaled ? ' (9 holes, per 18)' : ''}`
          : 'Tap a bar for that round'}
      </Text>
      <View style={styles.plotRow}>
        <View style={styles.axis}>
          <Text style={styles.axisText}>{formatTrendValue(max, series.unit, signed)}</Text>
          {min < 0 ? <Text style={styles.axisText}>{formatTrendValue(min, series.unit, signed)}</Text> : null}
        </View>
        <View style={styles.plot}>
          <View style={[styles.zero, { top: zeroTop }]} />
          {avgTop != null ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              style={[styles.avg, { top: Math.max(0, Math.min(PLOT_HEIGHT - 1, avgTop)) }]}
            />
          ) : null}
          <View style={styles.bars}>
            {series.points.map((point, index) => {
              const on = selected === index;
              const label = `${point.label}, ${point.courseName}: ${formatTrendValue(point.value, series.unit, signed)}`;
              return (
                <Pressable
                  key={point.roundId}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: on }}
                  onPress={() => setSelected(on ? null : index)}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={styles.slot}>
                  {point.value == null ? (
                    <View style={[styles.gap, { top: zeroTop - 1 }]} />
                  ) : point.value >= 0 ? (
                    <View
                      style={[
                        styles.bar,
                        styles.barUp,
                        on && styles.barOn,
                        { top: zeroTop - px(point.value), height: px(point.value) },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.bar,
                        styles.barDown,
                        on && styles.barOn,
                        { top: zeroTop, height: px(point.value) },
                      ]}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.foot}>
        <Text style={styles.axisText}>{series.points[0]?.label ?? ''}</Text>
        <Pressable accessibilityRole="button" onPress={() => setTable((on) => !on)} hitSlop={8}>
          <Text style={styles.link}>{table ? 'Hide numbers' : 'Show numbers'}</Text>
        </Pressable>
        <Text style={styles.axisText}>{series.points[series.points.length - 1]?.label ?? ''}</Text>
      </View>
      {table ? (
        <View style={styles.table}>
          {[...series.points].reverse().map((point) => (
            <View key={point.roundId} style={styles.tableRow}>
              <Text style={styles.tableLabel} numberOfLines={1}>
                {point.label} · {point.courseName}
                {point.scaled ? ' · 9' : ''}
              </Text>
              <Text style={styles.tableValue}>{formatTrendValue(point.value, series.unit, signed)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    readout: { color: colors.cream, fontSize: type.tiny, fontWeight: '800' },
    plotRow: { flexDirection: 'row', gap: 6 },
    axis: { height: PLOT_HEIGHT, justifyContent: 'space-between', minWidth: 32 },
    axisText: { color: colors.muted, fontSize: type.tiny, fontWeight: '700' },
    plot: { flex: 1, height: PLOT_HEIGHT },
    zero: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line },
    avg: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      borderTopWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.muted,
    },
    bars: { ...StyleSheet.absoluteFill, flexDirection: 'row', justifyContent: 'space-between', gap: 2 },
    slot: { flex: 1, height: PLOT_HEIGHT, maxWidth: 28 },
    bar: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.lime },
    barUp: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    barDown: { borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
    barOn: { backgroundColor: colors.cream },
    gap: { position: 'absolute', left: '30%', right: '30%', height: 2, backgroundColor: colors.line },
    foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 38 },
    link: { color: colors.cream, fontSize: type.tiny, fontWeight: '800', textDecorationLine: 'underline' },
    table: { gap: 4, paddingTop: 4 },
    tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    tableLabel: { color: colors.muted, fontSize: type.tiny, flexShrink: 1 },
    tableValue: { color: colors.cream, fontSize: type.tiny, fontWeight: '800' },
  });
}
