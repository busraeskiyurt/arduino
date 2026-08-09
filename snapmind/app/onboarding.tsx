import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { SCAN_RANGE_LABELS, type ScanRange } from '@/config';
import { META_KEYS, setMeta } from '@/db/database';
import {
  countScreenshots,
  requestPhotoPermission,
} from '@/discovery/screenshotDiscovery';
import { requestNotificationPermission } from '@/notifications/notifier';
import { useScanStore } from '@/state/scanStore';
import { colors, formatCount, spacing, styles } from '@/ui/theme';

type Step = 'intro' | 'counting' | 'ready' | 'denied';

/**
 * First run: ask for the library, count the screenshots, and let the user
 * start. No image is uploaded anywhere during this screen — counting is pure
 * local metadata.
 */
export default function Onboarding() {
  const [step, setStep] = useState<Step>('intro');
  const [count, setCount] = useState<number | null>(null);
  const [range, setRange] = useState<ScanRange>('all');
  const startScan = useScanStore((s) => s.startScan);

  const grantAccess = async () => {
    const permission = await requestPhotoPermission();
    if (!permission.granted) {
      setStep('denied');
      return;
    }
    setStep('counting');
    try {
      setCount(await countScreenshots('all'));
    } catch {
      setCount(null);
    }
    setStep('ready');
    // Asked after the library, so the first prompt is the one that matters.
    void requestNotificationPermission();
  };

  const begin = async () => {
    await setMeta(META_KEYS.onboarded, '1');
    router.replace('/(tabs)');
    void startScan(range, { notify: false });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ height: spacing.xxl }} />
      <Text style={styles.h1}>SnapMind</Text>
      <Text style={styles.body}>
        SnapMind scans your screenshots to find information you may want to act
        on — events, places, tasks, products and useful details you saved and
        forgot about.
      </Text>

      {step === 'intro' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.h2}>Photo library access</Text>
            <Text style={styles.muted}>
              SnapMind needs read access to your photo library so it can find
              your screenshots by itself. You will never have to pick them one
              by one.
            </Text>
            <Text style={styles.muted}>
              Only images identified as screenshots are analyzed. The rest of
              your camera roll is left alone.
            </Text>
            <Text style={styles.muted}>
              Screenshots selected for analysis are sent to Google Gemini to be
              understood. Everything SnapMind extracts is stored on this device.
            </Text>
          </View>

          <Pressable style={styles.primaryButton} onPress={grantAccess}>
            <Text style={styles.primaryButtonText}>Connect photo library</Text>
          </Pressable>
        </>
      ) : null}

      {step === 'counting' ? (
        <View style={styles.card}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.body}>Looking for screenshots…</Text>
        </View>
      ) : null}

      {step === 'ready' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.h2}>
              {count === null
                ? 'Screenshots found'
                : `We found ${formatCount(count)} screenshots`}
            </Text>
            <Text style={styles.muted}>
              Results appear as they are analyzed — you do not have to wait for
              the whole library to finish.
            </Text>
          </View>

          <Text style={styles.h2}>What should SnapMind scan?</Text>
          <View style={{ gap: spacing.sm }}>
            {(Object.keys(SCAN_RANGE_LABELS) as ScanRange[]).map((option) => {
              const selected = option === range;
              return (
                <Pressable
                  key={option}
                  onPress={() => setRange(option)}
                  style={[
                    styles.secondaryButton,
                    selected && {
                      borderColor: colors.accent,
                      backgroundColor: colors.accentSoft,
                    },
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {selected ? '● ' : '○ '}
                    {SCAN_RANGE_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.primaryButton} onPress={begin}>
            <Text style={styles.primaryButtonText}>Start scan</Text>
          </Pressable>
        </>
      ) : null}

      {step === 'denied' ? (
        <View style={styles.card}>
          <Text style={styles.h2}>Without library access</Text>
          <Text style={styles.muted}>
            SnapMind cannot find your screenshots on its own. You can still
            analyze images one at a time, or grant access later in Settings.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={async () => {
              await setMeta(META_KEYS.onboarded, '1');
              router.replace('/(tabs)');
            }}
          >
            <Text style={styles.secondaryButtonText}>Continue anyway</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}
