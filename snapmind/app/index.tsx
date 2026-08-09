import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { META_KEYS, getMeta } from '@/db/database';
import { colors, styles } from '@/ui/theme';

/** Entry gate: onboarding on first launch, the app itself afterwards. */
export default function Index() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void getMeta(META_KEYS.onboarded).then((value) => setOnboarded(value === '1'));
  }, []);

  if (onboarded === null) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}
