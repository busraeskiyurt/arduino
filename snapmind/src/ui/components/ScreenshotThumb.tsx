import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';

/**
 * The thumbnail button that sits next to every extracted result.
 *
 * SnapMind's output is text the AI derived from an image, so the source
 * screenshot has to stay one tap away — both to check the extraction and to
 * see the parts of the screenshot the summary left out. Rendering the actual
 * screenshot (rather than a generic icon) also makes a card instantly
 * recognisable in a long list.
 */
export function ScreenshotThumb({
  uri,
  onPress,
  count = 1,
  size = 64,
}: {
  uri: string;
  onPress: () => void;
  /** Number of screenshots behind this card; shows a ×N badge when > 1. */
  count?: number;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={
        count > 1
          ? `Open source screenshots, ${count} of them`
          : 'Open source screenshot'
      }
      hitSlop={6}
      style={({ pressed }) => [
        thumbStyles.wrapper,
        { width: size, height: size, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
      />
      <View style={thumbStyles.scrim} />
      <Text style={thumbStyles.glyph}>⤢</Text>
      {count > 1 ? (
        <View style={thumbStyles.countBadge}>
          <Text style={thumbStyles.countText}>×{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const thumbStyles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  glyph: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  countBadge: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
