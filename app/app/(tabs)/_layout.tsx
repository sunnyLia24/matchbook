import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#c4553d', headerShown: true,
      headerStyle: { backgroundColor: '#faf5ef' }, headerShadowVisible: false }}>
      <Tabs.Screen name="index" options={{ title: 'Roster',
        tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats',
        tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }} />
    </Tabs>
  );
}
