import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { WEB_BASE_URL } from '../../src/lib/config';
import { ChatMeta } from '../../src/types';
import { colors, radii, spacing, cardBase } from '../../src/theme';

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
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.muted}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListEmptyComponent={<Text style={s.empty}>No chats yet — go make an introduction 💌</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>Chat for {item.friendName}</Text>
            <Text style={s.meta}>{new Date(item.created_at).toLocaleString()}</Text>
          </View>
          {item.status === 'active'
            ? <Pressable style={({ pressed }) => [s.fwd, pressed && s.fwdPressed]} onPress={() => forward(item)}>
                <Text style={s.fwdText}>Forward to {item.friendName}</Text>
              </Pressable>
            : <Text style={s.ended}>ended</Text>}
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 60, fontSize: 15, lineHeight: 22 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, ...cardBase, padding: 14 },
  name: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, color: colors.ink },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  fwd: { minHeight: 44, backgroundColor: colors.brand, borderRadius: radii.sm, paddingVertical: 9,
         paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  fwdPressed: { backgroundColor: colors.brandDeep },
  fwdText: { color: colors.white, fontWeight: '600', fontSize: 13 },
  ended: { color: colors.muted, fontWeight: '600', fontSize: 12, textTransform: 'lowercase' },
});
