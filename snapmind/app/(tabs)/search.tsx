import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatForDisplay } from '@/actions/datetime';
import { searchResults } from '@/db/repositories';
import { CATEGORY_ICONS, type ResultCard } from '@/db/schema';
import { ScreenshotThumb } from '@/ui/components/ScreenshotThumb';
import { colors, spacing, styles } from '@/ui/theme';

/**
 * Search covers everything SnapMind has ever analyzed, including the results
 * that were classified NON_ACTIONABLE or UNCERTAIN. Nothing is thrown away —
 * it just does not get a card in the inbox.
 */
export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultCard[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    // Debounced so typing does not hit SQLite on every keystroke.
    const handle = setTimeout(() => {
      void searchResults(query).then(setResults);
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={results}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: spacing.md }}>
          <Text style={styles.h1}>Search</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your screenshots…"
            placeholderTextColor={colors.textMuted}
            style={searchStyles.input}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.trim().length >= 2 && results.length === 0 ? (
            <Text style={styles.muted}>No matches yet.</Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <SearchRow card={item} />}
    />
  );
}

function SearchRow({ card }: { card: ResultCard }) {
  const detail =
    formatForDisplay(card.starts_at ?? card.due_at) ??
    card.place_name ??
    card.subtitle ??
    card.summary;

  return (
    <Pressable
      style={[styles.card, searchStyles.row]}
      onPress={() => router.push(`/card/${card.id}`)}
    >
      <ScreenshotThumb
        uri={card.asset_uri}
        size={54}
        count={card.duplicate_count}
        onPress={() =>
          router.push({ pathname: '/viewer', params: { resultId: String(card.id) } })
        }
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={searchStyles.title} numberOfLines={1}>
          {CATEGORY_ICONS[card.category]} {card.title ?? 'Untitled'}
        </Text>
        {detail ? (
          <Text style={styles.muted} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        {card.classification !== 'ACTIONABLE' ? (
          <Text style={searchStyles.tag}>{card.classification}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const searchStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  tag: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
