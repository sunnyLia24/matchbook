import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { Friend } from '../../src/types';
import { colors, radii, spacing, buttonBase, cardBase } from '../../src/theme';

export default function Roster() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    supabase.from('friends').select('*').order('created_at')
      .then(({ data }) => setFriends((data as Friend[]) ?? []));
  }, []));

  return (
    <View style={s.wrap}>
      <FlatList
        data={friends}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text style={s.empty}>Add your first single friend 💘</Text>}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [s.row, pressed && s.rowPressed]} onPress={() => router.push(`/friend/${item.id}`)}>
            {item.photos[0]
              ? <Image source={{ uri: item.photos[0] }} style={s.avatar} />
              : <View style={[s.avatar, s.avatarEmpty]}><Text style={{ fontSize: 22 }}>💘</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.first_name}{item.age ? `, ${item.age}` : ''}</Text>
              <Text style={s.pitch} numberOfLines={1}>{item.pitch ?? ''}</Text>
            </View>
            <Text style={[s.badge, item.status !== 'single' && s.badgeOff]}>
              {item.status === 'single' ? (item.consented ? 'live' : 'no consent') : item.status}
            </Text>
          </Pressable>
        )}
      />
      {friends.length > 0 && (
        <Pressable style={({ pressed }) => [s.deckBtn, pressed && s.deckBtnPressed]} onPress={() => router.push('/deck')}>
          <Text style={s.deckText}>🎉 Party mode</Text>
        </Pressable>
      )}
      <Pressable style={({ pressed }) => [s.add, pressed && s.addPressed]} onPress={() => router.push('/friend/new')}>
        <Text style={{ color: colors.white, fontSize: 30, lineHeight: 32 }}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 60, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...cardBase, padding: spacing.md },
  rowPressed: { backgroundColor: colors.bg },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarEmpty: { backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2, color: colors.ink },
  pitch: { color: colors.muted, marginTop: 2 },
  badge: { fontSize: 12, color: colors.brand, fontWeight: '600', textTransform: 'lowercase' },
  badgeOff: { color: colors.muted },
  deckBtn: { ...buttonBase, position: 'absolute', bottom: 24, alignSelf: 'center', minHeight: 0,
             backgroundColor: colors.night, paddingVertical: 14, paddingHorizontal: 26, borderRadius: radii.pill },
  deckBtnPressed: { opacity: 0.85 },
  deckText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  add: { position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26,
         backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  addPressed: { backgroundColor: colors.brandDeep },
});
