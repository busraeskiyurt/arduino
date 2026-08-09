import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { actionsForCard, type ActionSpec } from '@/actions';
import { formatForDisplay } from '@/actions/datetime';
import { markGroupCompleted } from '@/db/repositories';
import { CATEGORY_ICONS, type ResultCard } from '@/db/schema';
import { colors, spacing, styles } from '../theme';
import { ScreenshotThumb } from './ScreenshotThumb';

/**
 * One Action Inbox card: what the AI understood, the source screenshot, and
 * the single button that gets the user to the Google service that matters.
 */
export function ActionCard({
  card,
  onCompleted,
}: {
  card: ResultCard;
  onCompleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const actions = actionsForCard(card);
  const [primary, ...secondary] = actions;

  const when = formatForDisplay(card.starts_at ?? card.due_at);
  const where = card.place_name ?? card.address;

  const openScreenshots = () =>
    router.push({
      pathname: '/viewer',
      params: { resultId: String(card.id) },
    });

  const runAction = async (action: ActionSpec) => {
    setBusy(true);
    try {
      const outcome = await action.run();
      if (!outcome.ok) {
        Alert.alert('Could not complete', outcome.message ?? 'Please try again.');
        return;
      }
      if (action.completesCard) {
        // The whole duplicate group is done, not just the representative.
        await markGroupCompleted(card);
        onCompleted();
      }
      if (outcome.message) Alert.alert('SnapMind', outcome.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={cardStyles.header}>
        <View style={cardStyles.headerText}>
          <View style={styles.row}>
            <Text style={cardStyles.category}>
              {CATEGORY_ICONS[card.category]} {card.category}
            </Text>
            {card.duplicate_count > 1 ? (
              <Text style={styles.muted}>
                Found in {card.duplicate_count} screenshots
              </Text>
            ) : null}
          </View>

          <Pressable onPress={() => router.push(`/card/${card.id}`)}>
            <Text style={cardStyles.title} numberOfLines={2}>
              {card.title ?? 'Untitled'}
            </Text>
          </Pressable>

          {when ? <Text style={styles.body}>{when}</Text> : null}
          {where ? (
            <Text style={styles.body} numberOfLines={1}>
              {where}
            </Text>
          ) : null}
          {card.price ? <Text style={styles.body}>{card.price}</Text> : null}
          {!when && !where && !card.price && card.subtitle ? (
            <Text style={styles.body} numberOfLines={2}>
              {card.subtitle}
            </Text>
          ) : null}
        </View>

        {/* The source screenshot is always one tap away from its data. */}
        <ScreenshotThumb
          uri={card.asset_uri}
          count={card.duplicate_count}
          onPress={openScreenshots}
        />
      </View>

      <View style={cardStyles.actions}>
        {primary ? (
          <Pressable
            disabled={busy}
            onPress={() => runAction(primary)}
            style={[styles.primaryButton, cardStyles.primary, busy && cardStyles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{primary.label}</Text>
            )}
          </Pressable>
        ) : null}

        <Pressable
          onPress={openScreenshots}
          style={[styles.secondaryButton, cardStyles.ghost]}
          accessibilityLabel="View source screenshot"
        >
          <Text style={styles.secondaryButtonText}>⤢ Screenshot</Text>
        </Pressable>
      </View>

      {secondary.length > 0 ? (
        <View style={cardStyles.secondaryRow}>
          {secondary.map((action) => (
            <Pressable
              key={action.kind}
              disabled={busy}
              onPress={() => runAction(action)}
              style={cardStyles.linkButton}
            >
              <Text style={cardStyles.linkText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  category: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  primary: {
    flex: 1,
    justifyContent: 'center',
  },
  ghost: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  linkButton: {
    paddingVertical: spacing.xs,
  },
  linkText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
});
