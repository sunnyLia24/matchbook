import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { Friend } from '../../src/types';

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
          <Pressable style={s.row} onPress={() => router.push(`/friend/${item.id}`)}>
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
        <Pressable style={s.deckBtn} onPress={() => router.push('/deck')}>
          <Text style={s.deckText}>🎉 Party mode</Text>
        </Pressable>
      )}
      <Pressable style={s.add} onPress={() => router.push('/friend/new')}>
        <Text style={{ color: '#fff', fontSize: 30, lineHeight: 32 }}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#faf5ef' },
  empty: { textAlign: 'center', color: '#7a6a5b', marginTop: 60, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
         borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#eadfd3' },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarEmpty: { backgroundColor: '#eadfd3', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '600', color: '#2b2018' },
  pitch: { color: '#7a6a5b', marginTop: 2 },
  badge: { fontSize: 12, color: '#2e7d32', fontWeight: '600', textTransform: 'uppercase' },
  badgeOff: { color: '#a4937f' },
  deckBtn: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: '#2b2018',
             borderRadius: 26, paddingVertical: 14, paddingHorizontal: 26 },
  deckText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  add: { position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26,
         backgroundColor: '#c4553d', alignItems: 'center', justifyContent: 'center' },
});
