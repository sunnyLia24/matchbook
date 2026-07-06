import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { WEB_BASE_URL } from '../../src/lib/config';
import { ChatMeta } from '../../src/types';

type Row = ChatMeta & { friendName: string };

export default function Chats() {
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [{ data: chats }, { data: friends }] = await Promise.all([
      supabase.from('chats')
        .select('id, friend_id, status, ended_by, friend_token, created_at, ended_at')
        .order('created_at', { ascending: false }),
      supabase.from('friends').select('id, first_name'),
    ]);
    const names = new Map((friends ?? []).map((f) => [f.id, f.first_name]));
    setRows(((chats as ChatMeta[]) ?? []).map((c) => ({ ...c, friendName: names.get(c.friend_id) ?? '?' })));
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const forward = (r: Row) => Share.share({
    message: `Someone met you through me and wants to chat 👀 Your private Matchbook link (type STOP anytime to end it): ${WEB_BASE_URL}/c/${r.friend_token}`,
  });

  return (
    <FlatList
      style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}
      data={rows} keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListEmptyComponent={<Text style={s.empty}>When someone taps "Say hi" on a shared profile, the chat shows up here.</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>Chat for {item.friendName}</Text>
            <Text style={s.meta}>{new Date(item.created_at).toLocaleString()}</Text>
          </View>
          {item.status === 'active'
            ? <Pressable style={s.fwd} onPress={() => forward(item)}>
                <Text style={s.fwdText}>Forward to {item.friendName}</Text>
              </Pressable>
            : <Text style={s.ended}>ended</Text>}
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#faf5ef' },
  empty: { textAlign: 'center', color: '#7a6a5b', marginTop: 60, fontSize: 15, lineHeight: 22 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
          borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#eadfd3' },
  name: { fontSize: 16, fontWeight: '600', color: '#2b2018' },
  meta: { color: '#a4937f', fontSize: 12, marginTop: 2 },
  fwd: { backgroundColor: '#c4553d', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  fwdText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  ended: { color: '#a4937f', fontWeight: '600', fontSize: 12, textTransform: 'uppercase' },
});
