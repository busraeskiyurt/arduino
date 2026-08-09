import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { registerBackgroundScan } from '@/background/backgroundScan';
import { getDb } from '@/db/database';
import { subscribeToNewScreenshots } from '@/discovery/changeDetection';
import { getPhotoPermission } from '@/discovery/screenshotDiscovery';
import { configureNotificationHandler } from '@/notifications/notifier';
import { checkConditions, loadSettings } from '@/processing/conditions';
import { runQueue } from '@/processing/queue';
import { requeueStuckAssets } from '@/db/repositories';
import { useScanStore } from '@/state/scanStore';
import { colors } from '@/ui/theme';

configureNotificationHandler();

export default function RootLayout() {
  const refreshStats = useScanStore((s) => s.refreshStats);
  const bumpResults = useScanStore((s) => s.bumpResults);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      await getDb();
      // Recover anything a previous launch left mid-flight.
      await requeueStuckAssets();
      await refreshStats();
      await registerBackgroundScan().catch(() => undefined);

      // Subscribing before the library permission exists throws on both
      // platforms, so the listener waits for onboarding to finish.
      if (!(await getPhotoPermission()).granted) return;

      // Foreground detection of new screenshots. Analysis of what it finds is
      // still gated on the user's settings and the network conditions.
      unsubscribe = subscribeToNewScreenshots(() => {
        void (async () => {
          const settings = await loadSettings();
          if (!settings.autoAnalyzeNew) return;
          if (await checkConditions()) return;
          await runQueue({
            maxItems: 10,
            onEvent: (event) => {
              if (event.lastResult) bumpResults();
            },
          });
          await refreshStats();
        })();
      });
    })();

    return () => unsubscribe?.();
  }, [bumpResults, refreshStats]);

  // Tapping "SnapMind found an event" opens that exact card.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const resultId = response.notification.request.content.data?.resultId;
        if (typeof resultId === 'number' || typeof resultId === 'string') {
          router.push(`/card/${resultId}`);
        }
      },
    );
    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="card/[id]" options={{ title: 'Details' }} />
        <Stack.Screen
          name="viewer"
          options={{ title: 'Screenshot', presentation: 'modal' }}
        />
        <Stack.Screen name="manual" options={{ title: 'Analyze an image' }} />
      </Stack>
    </>
  );
}
