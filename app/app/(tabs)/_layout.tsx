import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { registerPush } from '../../src/lib/push';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  useEffect(() => { registerPush(); }, []);
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.muted,
      headerShown: true, headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink,
      headerShadowVisible: false,
      tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line } }}>
      <Tabs.Screen name="index" options={{ title: 'Roster',
        tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats',
        tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }} />
    </Tabs>
  );
}
