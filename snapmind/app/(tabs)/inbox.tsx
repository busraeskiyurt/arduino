import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getInboxCards } from '@/db/repositories';
import { CATEGORY_LABELS, type Category, type ResultCard } from '@/db/schema';
import { useScanStore } from '@/state/scanStore';
import { ActionCard } from '@/ui/components/ActionCard';
import { ScanProgress } from '@/ui/components/ScanProgress';
import { colors, formatCount, spacing, styles } from '@/ui/theme';

/**
 * The Action Inbox — the core screen.
 *
 * It only ever contains ACTIONABLE results that have not been dealt with, one
 * card per duplicate group. A 10,000-screenshot library still produces a list
 * a person can actually work through.
 */
export default function Inbox() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState<Category | undefined>(
    params.category && params.category in CATEGORY_LABELS
      ? (params.category as Category)
      : undefined,
  );
  const [cards, setCards] = useState<ResultCard[]>([]);
  const resultsVersion = useScanStore((s) => s.resultsVersion);
  const stats = useScanStore((s) => s.stats);

  const load = useCallback(async () => {
    setCards(await getInboxCards(100, 0, category));
  }, [category]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, resultsVersion]),
  );

  const categories = (Object.keys(CATEGORY_LABELS) as Category[]).filter(
    (key) => (stats?.byCategory[key] ?? 0) > 0,
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={cards}
      keyExtractor={(card) => String(card.id)}
      renderItem={({ item }) => <ActionCard card={item} onCompleted={load} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.md }}>
          <Text style={styles.h1}>Action Inbox</Text>
          <Text style={styles.muted}>
            {cards.length === 0
              ? 'Nothing needs your attention right now.'
              : `${formatCount(cards.length)} items need your attention`}
          </Text>

          <ScanProgress />

          {categories.length > 0 ? (
            <View style={inboxStyles.filterRow}>
              <FilterChip
                label="All"
                active={category === undefined}
                onPress={() => setCategory(undefined)}
              />
              {categories.map((key) => (
                <FilterChip
                  key={key}
                  label={CATEGORY_LABELS[key]}
                  active={category === key}
                  onPress={() => setCategory(key)}
                />
              ))}
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={[styles.card, { marginTop: spacing.lg }]}>
          <Text style={styles.h2}>Inbox zero</Text>
          <Text style={styles.muted}>
            Everything SnapMind found has been handled. Non-actionable
            screenshots are still searchable — they just do not get a card.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push('/(tabs)/search')}
          >
            <Text style={styles.secondaryButtonText}>Search everything</Text>
          </Pressable>
        </View>
      }
    />
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[inboxStyles.chip, active && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
    >
      <Text style={[styles.muted, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const inboxStyles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
});
