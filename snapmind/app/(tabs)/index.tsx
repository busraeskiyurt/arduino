import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SCAN_RANGE_LABELS, type ScanRange } from '@/config';
import { CATEGORY_ICONS, CATEGORY_LABELS, type Category } from '@/db/schema';
import { useScanStore } from '@/state/scanStore';
import { ScanProgress } from '@/ui/components/ScanProgress';
import { colors, formatCount, spacing, styles } from '@/ui/theme';

/**
 * Home is a summary of what SnapMind has already done with the user's library,
 * not a prompt to feed it another screenshot. Manual analysis is a small link
 * at the bottom, exactly where a fallback belongs.
 */
export default function Home() {
  const { phase, stats, lastScanFinishedAt, range } = useScanStore();
  const startScan = useScanStore((s) => s.startScan);
  const pauseScan = useScanStore((s) => s.pauseScan);
  const resumeScan = useScanStore((s) => s.resumeScan);
  const refreshStats = useScanStore((s) => s.refreshStats);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshStats();
    }, [refreshStats]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshStats();
    setRefreshing(false);
  };

  const scanning = phase === 'discovering' || phase === 'analyzing';
  const usefulItems = Object.values(stats?.byCategory ?? {}).reduce(
    (sum, n) => sum + n,
    0,
  );
  const categories = (Object.keys(CATEGORY_LABELS) as Category[]).filter(
    (category) => (stats?.byCategory[category] ?? 0) > 0,
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <Text style={styles.h1}>Your screenshots</Text>

      <View style={styles.card}>
        <Text style={homeStyles.bigNumber}>
          {formatCount(stats?.analyzed ?? 0)}
        </Text>
        <Text style={styles.muted}>
          screenshots scanned
          {stats?.pending ? ` · ${formatCount(stats.pending)} waiting` : ''}
        </Text>

        <View style={homeStyles.divider} />

        <Text style={homeStyles.bigNumber}>{formatCount(usefulItems)}</Text>
        <Text style={styles.muted}>useful items found</Text>

        {lastScanFinishedAt ? (
          <Text style={styles.muted}>
            Last scan: {new Date(lastScanFinishedAt).toLocaleString()}
          </Text>
        ) : null}
      </View>

      <ScanProgress />

      {categories.length > 0 ? (
        <View style={homeStyles.categoryGrid}>
          {categories.map((category) => (
            <Pressable
              key={category}
              style={homeStyles.categoryTile}
              onPress={() =>
                router.push({ pathname: '/(tabs)/inbox', params: { category } })
              }
            >
              <Text style={homeStyles.categoryIcon}>{CATEGORY_ICONS[category]}</Text>
              <Text style={homeStyles.categoryCount}>
                {formatCount(stats?.byCategory[category] ?? 0)}
              </Text>
              <Text style={styles.muted}>{CATEGORY_LABELS[category]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {scanning ? (
        <Pressable style={styles.secondaryButton} onPress={pauseScan}>
          <Text style={styles.secondaryButtonText}>Pause scan</Text>
        </Pressable>
      ) : phase === 'paused' || (stats?.pending ?? 0) > 0 ? (
        <Pressable style={styles.primaryButton} onPress={() => void resumeScan()}>
          <Text style={styles.primaryButtonText}>
            Resume scan{stats?.pending ? ` (${formatCount(stats.pending)} left)` : ''}
          </Text>
        </Pressable>
      ) : (
        <Pressable style={styles.primaryButton} onPress={() => void startScan(range)}>
          <Text style={styles.primaryButtonText}>Scan for new screenshots</Text>
        </Pressable>
      )}

      {!scanning ? <RangePicker current={range} /> : null}

      {stats?.errored ? (
        <Text style={styles.muted}>
          {formatCount(stats.errored)} screenshots failed after several attempts.
          They stay in your library and can be retried from Settings.
        </Text>
      ) : null}

      <Pressable
        style={[styles.secondaryButton, { marginTop: spacing.lg }]}
        onPress={() => router.push('/manual')}
      >
        <Text style={styles.secondaryButtonText}>Analyze a single image</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Lets the user re-run a narrower scan without leaving Home. */
function RangePicker({ current }: { current: ScanRange }) {
  const startScan = useScanStore((s) => s.startScan);
  return (
    <View style={homeStyles.rangeRow}>
      {(Object.keys(SCAN_RANGE_LABELS) as ScanRange[]).map((option) => (
        <Pressable
          key={option}
          onPress={() => void startScan(option)}
          style={[
            homeStyles.rangeChip,
            option === current && { borderColor: colors.accent },
          ]}
        >
          <Text style={styles.muted}>{SCAN_RANGE_LABELS[option]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const homeStyles = StyleSheet.create({
  bigNumber: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryTile: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  categoryIcon: {
    fontSize: 18,
  },
  categoryCount: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rangeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
});
