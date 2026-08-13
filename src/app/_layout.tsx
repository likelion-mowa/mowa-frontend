import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// NativeWind entry. Imported exactly once, here.
import '../../global.css';

import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

export default function RootLayout() {
  // The detect → candidate flow runs app-wide, independent of which screen is
  // mounted. On web the detector subscription is a no-op by design.
  useEffect(() => useWalkCandidateFlow.getState().startCandidateFlow(), []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
