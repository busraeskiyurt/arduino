import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getCardById, getGroupMembers } from '@/db/repositories';
import type { ResultCard } from '@/db/schema';
import { colors, spacing, styles } from '@/ui/theme';

/**
 * Full-screen screenshot viewer.
 *
 * Every extracted result keeps a link back to the pixels it came from, so the
 * user can always check what SnapMind read — and see whatever the summary left
 * out. When a card represents several duplicate screenshots, all of them are
 * swipeable here.
 */
export default function Viewer() {
  const params = useLocalSearchParams<{ resultId?: string; uri?: string }>();
  const [items, setItems] = useState<ResultCard[] | null>(null);
  const width = Dimensions.get('window').width;

  useEffect(() => {
    void (async () => {
      if (!params.resultId) {
        setItems([]);
        return;
      }
      const card = await getCardById(Number(params.resultId));
      if (!card) {
        setItems([]);
        return;
      }
      const members = await getGroupMembers(card);
      // Open on the card the user tapped, with its siblings alongside.
      setItems(members.length > 0 ? members : [card]);
    })();
  }, [params.resultId]);

  // A raw URI (manual analysis) has no database row behind it yet.
  if (params.uri && !params.resultId) {
    return (
      <View style={viewerStyles.container}>
        <Stack.Screen options={{ title: 'Screenshot' }} />
        <Image
          source={{ uri: params.uri }}
          style={viewerStyles.image}
          contentFit="contain"
        />
      </View>
    );
  }

  if (items === null) {
    return (
      <View style={[viewerStyles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[viewerStyles.container, { justifyContent: 'center', padding: spacing.xl }]}>
        <Text style={styles.body}>This screenshot is no longer available.</Text>
      </View>
    );
  }

  return (
    <View style={viewerStyles.container}>
      <Stack.Screen
        options={{
          title:
            items.length > 1 ? `Screenshots (${items.length})` : 'Screenshot',
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={{ width }}>
            <Image
              source={{ uri: item.asset_uri }}
              style={viewerStyles.image}
              contentFit="contain"
              transition={150}
            />
            <View style={viewerStyles.caption}>
              <Text style={styles.muted} numberOfLines={1}>
                {item.asset_filename ?? 'Screenshot'}
              </Text>
              {item.asset_creation_time ? (
                <Text style={styles.muted}>
                  {new Date(item.asset_creation_time).toLocaleString()}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
      {items.length > 1 ? (
        <Text style={viewerStyles.hint}>Swipe to see the other screenshots</Text>
      ) : null}
    </View>
  );
}

const viewerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  caption: {
    padding: spacing.lg,
    gap: 2,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: spacing.lg,
  },
});
