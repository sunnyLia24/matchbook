import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { registerPush } from '../../src/lib/push';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const router = useRouter();
  useEffect(() => { registerPush(); }, []);
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.muted,
      headerShown: true, headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink,
      headerShadowVisible: false,
      headerRight: () => (
        <Pressable onPress={() => router.push('/settings')} hitSlop={10}
          style={{ paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' }}>
          <Ionicons name="settings-outline" color={colors.muted} size={22} />
        </Pressable>
      ),
      tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line } }}>
      <Tabs.Screen name="index" options={{ title: 'Roster',
        tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats',
        tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }} />
    </Tabs>
  );
}
