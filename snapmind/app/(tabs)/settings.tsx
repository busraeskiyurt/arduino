import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { hasGeminiApiKey, setGeminiApiKey } from '@/ai/apiKey';
import { CONFIG } from '@/config';
import { META_KEYS, resetDatabase } from '@/db/database';
import { useScanStore } from '@/state/scanStore';
import {
  loadSettings,
  saveSetting,
  type SnapMindSettings,
} from '@/processing/conditions';
import { colors, formatCount, spacing, styles } from '@/ui/theme';

export default function Settings() {
  const [settings, setSettings] = useState<SnapMindSettings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const stats = useScanStore((s) => s.stats);
  const refreshStats = useScanStore((s) => s.refreshStats);
  const pauseScan = useScanStore((s) => s.pauseScan);

  useEffect(() => {
    void loadSettings().then(setSettings);
    void hasGeminiApiKey().then(setKeySaved);
  }, []);

  const update = async (
    key: keyof typeof META_KEYS,
    field: keyof SnapMindSettings,
    value: boolean | number,
  ) => {
    await saveSetting(key, value);
    setSettings((current) => (current ? { ...current, [field]: value } : current));
  };

  const deleteEverything = () => {
    Alert.alert(
      'Delete SnapMind data',
      'This removes every screenshot record, result and setting SnapMind has stored on this device. Your photos are not touched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            pauseScan();
            await resetDatabase();
            await refreshStats();
            Alert.alert('SnapMind', 'All SnapMind data has been deleted.');
          },
        },
      ],
    );
  };

  if (!settings) return <View style={styles.screen} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Automatic analysis</Text>

        <Toggle
          label="Pause automatic analysis"
          hint="Stops background scanning and analysis of new screenshots. Manual scans still work."
          value={settings.autoAnalysisPaused}
          onChange={(value) =>
            update('autoAnalysisPaused', 'autoAnalysisPaused', value)
          }
        />
        <Toggle
          label="Analyze new screenshots automatically"
          hint="New screenshots are picked up and analyzed when the device has a suitable moment."
          value={settings.autoAnalyzeNew}
          onChange={(value) => update('autoAnalyzeNew', 'autoAnalyzeNew', value)}
        />
        <Toggle
          label="Wi-Fi only"
          hint="Analysis waits for Wi-Fi instead of using cellular data."
          value={settings.wifiOnly}
          onChange={(value) => update('wifiOnly', 'wifiOnly', value)}
        />
        <Toggle
          label="Notify about useful findings"
          hint={`At most ${CONFIG.maxNotificationsPerHour} notifications per hour, and only for high-confidence results.`}
          value={settings.notificationsEnabled}
          onChange={(value) =>
            update('notificationsEnabled', 'notificationsEnabled', value)
          }
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Gemini API key</Text>
        <Text style={styles.muted}>
          Stored in the device keychain and used only to analyze screenshots.
        </Text>
        <TextInput
          value={keyInput}
          onChangeText={setKeyInput}
          placeholder={keySaved ? '•••••••••• (saved)' : 'Paste your API key'}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={settingsStyles.input}
        />
        <View style={styles.row}>
          <Pressable
            style={[styles.primaryButton, { flex: 1 }]}
            onPress={async () => {
              await setGeminiApiKey(keyInput);
              setKeyInput('');
              setKeySaved(await hasGeminiApiKey());
            }}
          >
            <Text style={styles.primaryButtonText}>Save key</Text>
          </Pressable>
          {keySaved ? (
            <Pressable
              style={[styles.secondaryButton, { flex: 1 }]}
              onPress={async () => {
                await setGeminiApiKey(null);
                setKeySaved(false);
              }}
            >
              <Text style={styles.secondaryButtonText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Scan history</Text>
        <Row label="Screenshots discovered" value={stats?.discovered ?? 0} />
        <Row label="Analyzed" value={stats?.analyzed ?? 0} />
        <Row label="Waiting" value={stats?.pending ?? 0} />
        <Row label="Skipped locally" value={stats?.skipped ?? 0} />
        <Row label="Actionable results" value={stats?.actionable ?? 0} />
        <Row label="Non-actionable" value={stats?.nonActionable ?? 0} />
        <Row label="Uncertain" value={stats?.uncertain ?? 0} />
        <Row label="Failed" value={stats?.errored ?? 0} />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Privacy</Text>
        <Text style={styles.muted}>
          SnapMind reads your photo library to identify screenshots. Only images
          identified as screenshots are considered, and only those that pass
          local pre-filtering are sent to Google Gemini for analysis. The image
          data leaves the device for that request.
        </Text>
        <Text style={styles.muted}>
          Extracted results, scan progress and settings are stored in a local
          database on this device. SnapMind has no server of its own.
        </Text>
        <Pressable
          style={[styles.secondaryButton, { borderColor: colors.danger }]}
          onPress={deleteEverything}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.danger }]}>
            Delete SnapMind data
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={settingsStyles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.body}>{label}</Text>
        <Text style={styles.muted}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.spaceBetween}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.body}>{formatCount(value)}</Text>
    </View>
  );
}

const settingsStyles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
  },
});
