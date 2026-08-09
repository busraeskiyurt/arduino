import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { actionsForCard } from '@/actions';
import { formatForDisplay } from '@/actions/datetime';
import { dismissCard, getCardById, markGroupCompleted } from '@/db/repositories';
import { CATEGORY_ICONS, type ResultCard } from '@/db/schema';
import { useScanStore } from '@/state/scanStore';
import { colors, radius, spacing, styles } from '@/ui/theme';

/**
 * Full detail for one result: every field the AI extracted, the screenshot it
 * came from, and all available actions.
 */
export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [card, setCard] = useState<ResultCard | null>(null);
  const bumpResults = useScanStore((s) => s.bumpResults);

  useEffect(() => {
    void getCardById(Number(id)).then(setCard);
  }, [id]);

  if (!card) return <View style={styles.screen} />;

  const openViewer = () =>
    router.push({ pathname: '/viewer', params: { resultId: String(card.id) } });

  const fields: Array<[string, string | null]> = [
    ['When', formatForDisplay(card.starts_at)],
    ['Ends', formatForDisplay(card.ends_at)],
    ['Due', formatForDisplay(card.due_at)],
    ['Place', card.place_name],
    ['Address', card.address],
    ['Price', card.price],
    ['Link', card.url],
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* The screenshot leads the screen — the extracted data is a reading of
          it, and the user should be able to check that reading immediately. */}
      <Pressable onPress={openViewer} accessibilityLabel="Open full screenshot">
        <Image
          source={{ uri: card.asset_uri }}
          style={detailStyles.preview}
          contentFit="cover"
          transition={150}
        />
        <View style={detailStyles.previewBadge}>
          <Text style={detailStyles.previewBadgeText}>
            ⤢ {card.duplicate_count > 1 ? `${card.duplicate_count} screenshots` : 'View screenshot'}
          </Text>
        </View>
      </Pressable>

      <Text style={detailStyles.category}>
        {CATEGORY_ICONS[card.category]} {card.category} ·{' '}
        {Math.round(card.confidence * 100)}% confidence
      </Text>
      <Text style={styles.h1}>{card.title ?? 'Untitled'}</Text>
      {card.subtitle ? <Text style={styles.body}>{card.subtitle}</Text> : null}
      {card.summary ? <Text style={styles.muted}>{card.summary}</Text> : null}

      <View style={styles.card}>
        {fields
          .filter(([, value]) => Boolean(value))
          .map(([label, value]) => (
            <View key={label} style={styles.spaceBetween}>
              <Text style={styles.muted}>{label}</Text>
              <Text style={[styles.body, { flexShrink: 1, textAlign: 'right' }]}>
                {value}
              </Text>
            </View>
          ))}
        {card.classification !== 'ACTIONABLE' ? (
          <Text style={styles.muted}>
            Classified {card.classification} — stored and searchable, but not
            shown in the Action Inbox.
          </Text>
        ) : null}
      </View>

      {actionsForCard(card).map((action) => (
        <Pressable
          key={action.kind}
          style={styles.secondaryButton}
          onPress={async () => {
            const outcome = await action.run();
            if (!outcome.ok) {
              Alert.alert('Could not complete', outcome.message ?? 'Please try again.');
              return;
            }
            if (action.completesCard) {
              await markGroupCompleted(card);
              bumpResults();
              router.back();
            } else if (outcome.message) {
              Alert.alert('SnapMind', outcome.message);
            }
          }}
        >
          <Text style={styles.secondaryButtonText}>{action.label}</Text>
        </Pressable>
      ))}

      <Pressable
        style={styles.secondaryButton}
        onPress={async () => {
          await dismissCard(card.id);
          bumpResults();
          router.back();
        }}
      >
        <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>
          Dismiss
        </Text>
      </Pressable>

      {card.extracted_text ? (
        <View style={styles.card}>
          <Text style={styles.h2}>Text found in the screenshot</Text>
          <Text style={styles.muted}>{card.extracted_text}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const detailStyles = StyleSheet.create({
  preview: {
    width: '100%',
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  previewBadge: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  previewBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  category: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
});
