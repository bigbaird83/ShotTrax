import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatLateral, type DispersionPlan } from '@/src/domain/dispersion';
import { formatHistoryDate } from '@/src/domain/roundHistory';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

const PLOT_HEIGHT = 300;
const DOT = 12;
const HIT = 28;
const AXIS_W = 40;

function niceStep(span: number): number {
  if (span <= 40) return 10;
  if (span <= 100) return 25;
  return 50;
}

/**
 * Where a club's shots finished: up = toward the green, sideways = off the line.
 * The dashed center line is the start → green line; the ring is the average.
 * Tap a dot for its round; "Show numbers" lists every shot.
 */
export function DispersionPlot({ plan }: { plan: DispersionPlan }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  const alongs = plan.points.map((p) => p.along);
  const lateralMax = Math.max(20, ...plan.points.map((p) => Math.abs(p.lateral)));
  const xHalf = Math.ceil((lateralMax * 1.15) / 10) * 10;
  const lo = Math.max(0, Math.floor((Math.min(...alongs) - 15) / 10) * 10);
  const hi = Math.ceil((Math.max(...alongs) + 15) / 10) * 10;
  const step = niceStep(hi - lo);
  const ticks: number[] = [];
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) ticks.push(y);

  const plotW = Math.max(0, width - AXIS_W);
  const xOf = (lateral: number) => plotW / 2 + (lateral / xHalf) * (plotW / 2);
  const yOf = (along: number) => PLOT_HEIGHT - ((along - lo) / (hi - lo)) * PLOT_HEIGHT;
  const pick = plan.points.find((p) => p.shotId === selected) ?? null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.readout} numberOfLines={1}>
        {pick
          ? `${formatHistoryDate(pick.playedAt)} · ${pick.courseName} · Hole ${pick.holeNumber} · ${pick.along} yd · ${formatLateral(pick.lateral)}`
          : 'Tap a dot for that shot'}
      </Text>
      <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.axis}>
          {ticks.map((y) => (
            <Text key={y} style={[styles.axisText, { top: yOf(y) - 7 }]}>
              {y}
            </Text>
          ))}
        </View>
        <View style={styles.plot}>
          {ticks.map((y) => (
            <View key={y} style={[styles.grid, { top: yOf(y) }]} />
          ))}
          <View style={[styles.aim, { left: plotW / 2 }]} />
          {plotW > 0 && plan.avgAlong != null && plan.avgLateral != null ? (
            <View
              pointerEvents="none"
              style={[
                styles.avg,
                { left: xOf(plan.avgLateral) - 9, top: yOf(plan.avgAlong) - 9 },
              ]}
            />
          ) : null}
          {plotW > 0
            ? plan.points.map((point) => {
                const on = point.shotId === selected;
                return (
                  <Pressable
                    key={point.shotId}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatHistoryDate(point.playedAt)}, hole ${point.holeNumber}: ${point.along} yards, ${formatLateral(point.lateral)}`}
                    onPress={() => setSelected(on ? null : point.shotId)}
                    style={[styles.hit, { left: xOf(point.lateral) - HIT / 2, top: yOf(point.along) - HIT / 2 }]}>
                    <View style={[styles.dot, on && styles.dotOn]} />
                  </Pressable>
                );
              })
            : null}
        </View>
      </View>
      <View style={styles.foot}>
        <Text style={styles.axisText}>{`${xHalf} L`}</Text>
        <Pressable accessibilityRole="button" onPress={() => setTable((on) => !on)} hitSlop={8}>
          <Text style={styles.link}>{table ? 'Hide numbers' : 'Show numbers'}</Text>
        </Pressable>
        <Text style={styles.axisText}>{`${xHalf} R`}</Text>
      </View>
      {table ? (
        <View style={styles.table}>
          {[...plan.points].reverse().map((point) => (
            <View key={point.shotId} style={styles.tableRow}>
              <Text style={styles.tableLabel} numberOfLines={1}>
                {formatHistoryDate(point.playedAt)} · {point.courseName} · H{point.holeNumber}
              </Text>
              <Text style={styles.tableValue}>
                {point.along} yd · {formatLateral(point.lateral)}
              </Text>
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
    row: { flexDirection: 'row' },
    axis: { width: AXIS_W, height: PLOT_HEIGHT },
    axisText: { position: 'absolute', right: 6, color: colors.muted, fontSize: type.tiny, fontWeight: '700' },
    plot: { flex: 1, height: PLOT_HEIGHT, overflow: 'hidden' },
    grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line },
    aim: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1,
      borderLeftWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.muted,
    },
    avg: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.cream,
    },
    hit: { position: 'absolute', width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      backgroundColor: colors.lime,
      borderWidth: 2,
      borderColor: colors.bgElevated,
    },
    dotOn: { backgroundColor: colors.cream, transform: [{ scale: 1.4 }] },
    foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: AXIS_W },
    link: { color: colors.cream, fontSize: type.tiny, fontWeight: '800', textDecorationLine: 'underline' },
    table: { gap: 4, paddingTop: 4 },
    tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    tableLabel: { color: colors.muted, fontSize: type.tiny, flexShrink: 1 },
    tableValue: { color: colors.cream, fontSize: type.tiny, fontWeight: '800' },
  });
}
