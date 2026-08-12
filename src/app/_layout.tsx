import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// NativeWind entry. Imported exactly once, here.
import '../../global.css';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
