import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/sign-in');
    if (session && inAuth) router.replace('/(tabs)');
  }, [ready, session, segments, router]);

  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)/sign-in" />
      <Stack.Screen name="friend/[id]" options={{ headerShown: true, title: '', presentation: 'modal',
        headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink, headerShadowVisible: false }} />
      <Stack.Screen name="suitor-card" options={{ headerShown: true, title: '', presentation: 'modal',
        headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink, headerShadowVisible: false }} />
      <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings', presentation: 'modal',
        headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink, headerShadowVisible: false }} />
      <Stack.Screen name="deck" options={{ animation: 'fade' }} />
    </Stack>
  );
}
