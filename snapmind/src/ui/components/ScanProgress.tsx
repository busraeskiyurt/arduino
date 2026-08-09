import { StyleSheet, Text, View } from 'react-native';

import { CATEGORY_LABELS, type Category } from '@/db/schema';
import { useScanStore } from '@/state/scanStore';
import { colors, formatCount, radius, spacing, styles } from '../theme';

/**
 * Live scan readout: how far the scan has got, and — more importantly — what
 * it has already found. The counts tick up while the scan runs, which is what
 * makes a 10,000-screenshot sweep feel like it is working *for* the user
 * rather than making them wait.
 */
export function ScanProgress() {
  const phase = useScanStore((s) => s.phase);
  const discovered = useScanStore((s) => s.discovered);
  const processed = useScanStore((s) => s.processed);
  const failed = useScanStore((s) => s.failed);
  const stats = useScanStore((s) => s.stats);
  const blockMessage = useScanStore((s) => s.blockMessage);

  if (phase === 'idle') return null;

  const total = Math.max(discovered, processed);
  const ratio = total > 0 ? Math.min(1, processed / total) : 0;

  const found = Object.entries(stats?.byCategory ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>
        {phase === 'discovering'
          ? 'Scanning your screenshots'
          : phase === 'analyzing'
            ? 'Analyzing screenshots…'
            : phase === 'paused'
              ? 'Scan paused'
              : 'Scan on hold'}
      </Text>

      {phase === 'blocked' && blockMessage ? (
        <Text style={[styles.muted, { color: colors.warning }]}>{blockMessage}</Text>
      ) : (
        <Text style={styles.muted}>
          {formatCount(processed)} / {formatCount(total)}
          {discovered > 0 ? ` · found ${formatCount(discovered)} screenshots` : ''}
        </Text>
      )}

      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>

      {found.length > 0 ? (
        <View style={progressStyles.foundList}>
          {found.map(([category, count]) => (
            <Text key={category} style={progressStyles.foundItem}>
              ✓ {formatCount(count)} {CATEGORY_LABELS[category as Category]}
            </Text>
          ))}
        </View>
      ) : null}

      {failed > 0 ? (
        <Text style={styles.muted}>
          {formatCount(failed)} screenshots could not be analyzed and will be retried.
        </Text>
      ) : null}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  foundList: {
    marginTop: spacing.xs,
    gap: 2,
  },
  foundItem: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
});
