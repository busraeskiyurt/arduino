import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toResultInput } from '@/ai/classify';
import { analyzeScreenshot, MissingApiKeyError } from '@/ai/gemini';
import { insertDiscoveredAssets, markAssetStatus, saveResult } from '@/db/repositories';
import { buildUploadImage } from '@/processing/prefilter';
import { useScanStore } from '@/state/scanStore';
import { colors, radius, spacing, styles } from '@/ui/theme';

/**
 * The secondary fallback: analyze one image the user picks by hand.
 *
 * This exists for images that never reach the photo library — a file from
 * another app, a photo of a poster — not as the main way to use SnapMind.
 */
export default function Manual() {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const bumpResults = useScanStore((s) => s.bumpResults);

  const pickAndAnalyze = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (picked.canceled || picked.assets.length === 0) return;

    const asset = picked.assets[0];
    setPreview(asset.uri);
    setBusy(true);

    try {
      const image = await buildUploadImage(asset.uri, asset.width, asset.height);
      if (!image) {
        Alert.alert('SnapMind', 'That image could not be read.');
        return;
      }

      const analysis = await analyzeScreenshot(image);

      // Manual picks are recorded like any other asset so the result behaves
      // identically everywhere else in the app — including its screenshot link.
      const assetId = asset.assetId ?? `manual:${Date.now()}`;
      await insertDiscoveredAssets([
        {
          id: assetId,
          uri: asset.uri,
          filename: asset.fileName ?? null,
          width: asset.width ?? null,
          height: asset.height ?? null,
          creationTime: Date.now(),
          source: 'manual',
        },
      ]);
      const resultId = await saveResult(toResultInput(assetId, analysis));
      await markAssetStatus(assetId, 'analyzed');
      bumpResults();
      router.replace(`/card/${resultId}`);
    } catch (error) {
      Alert.alert(
        'SnapMind',
        error instanceof MissingApiKeyError
          ? 'Add a Gemini API key in Settings first.'
          : error instanceof Error
            ? error.message
            : 'Analysis failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Analyze an image</Text>
      <Text style={styles.muted}>
        SnapMind normally finds screenshots by itself. Use this for an image
        that is not in your library, or to re-check a single one.
      </Text>

      {preview ? (
        <Image source={{ uri: preview }} style={manualStyles.preview} contentFit="cover" />
      ) : null}

      <Pressable
        style={[styles.primaryButton, busy && { opacity: 0.6 }]}
        disabled={busy}
        onPress={pickAndAnalyze}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>Choose an image</Text>
        )}
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.muted}>
          The image you choose is sent to Google Gemini for analysis.
        </Text>
      </View>
    </ScrollView>
  );
}

const manualStyles = StyleSheet.create({
  preview: {
    width: '100%',
    height: 240,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
});
