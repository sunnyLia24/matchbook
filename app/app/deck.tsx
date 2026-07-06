import { useEffect, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { WEB_BASE_URL } from '../src/lib/config';
import { Friend } from '../src/types';
import { colors, radii, spacing, buttonBase } from '../src/theme';

const { width: W } = Dimensions.get('window');

export default function Deck() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const router = useRouter();

  useEffect(() => {
    supabase.from('friends').select('*').eq('status', 'single').eq('consented', true)
      .order('created_at').then(({ data }) => setFriends((data as Friend[]) ?? []));
  }, []);

  const share = (f: Friend) =>
    Share.share({ message: `Meet ${f.first_name} 🔥 ${WEB_BASE_URL}/p/${f.share_slug}` });

  return (
    <View style={s.wrap}>
      <FlatList
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        data={friends} keyExtractor={(f) => f.id}
        ListEmptyComponent={<View style={{ width: W, justifyContent: 'center' }}>
          <Text style={s.empty}>No live profiles — check status + consent.</Text></View>}
        renderItem={({ item }) => (
          <View style={s.card}>
            {item.photos[0]
              ? <Image source={{ uri: item.photos[0] }} style={s.photo} />
              : <View style={[s.photo, s.noPhoto]}><Text style={{ fontSize: 60 }}>💘</Text></View>}
            <Text style={s.name}>{item.first_name}{item.age ? `, ${item.age}` : ''}</Text>
            {!!item.city && <Text style={s.city}>{item.city}</Text>}
            {!!item.pitch && (
              <View style={s.pitchWrap}>
                <Text style={s.quoteMark}>"</Text>
                <Text style={s.pitch}>{item.pitch}</Text>
              </View>
            )}
            {(item.prompts ?? []).slice(0, 2).map((p) => (
              <View key={p.q} style={s.prompt}>
                <Text style={s.q}>{p.q.toUpperCase()}</Text><Text style={s.a}>{p.a}</Text>
              </View>
            ))}
            <Pressable style={({ pressed }) => [s.share, pressed && s.sharePressed]} onPress={() => share(item)}>
              <Text style={s.shareText}>Share {item.first_name}'s profile</Text>
            </Pressable>
          </View>
        )}
      />
      <Pressable style={({ pressed }) => [s.close, pressed && s.closePressed]} onPress={() => router.back()} hitSlop={8}>
        <Text style={s.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.night },
  card: { width: W, padding: 24, paddingTop: 70 },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: radii.xl, backgroundColor: colors.nightElevated },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.nightInk, fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 16 },
  city: { color: colors.nightMuted, fontSize: 16, marginTop: 2 },
  pitchWrap: { flexDirection: 'row', marginTop: 10 },
  quoteMark: { color: colors.champagne, fontSize: 34, fontWeight: '800', lineHeight: 34, marginRight: 4 },
  pitch: { flex: 1, color: colors.nightInk, fontSize: 18, fontWeight: '500', marginTop: 6, lineHeight: 25 },
  prompt: { backgroundColor: colors.nightElevated, borderRadius: radii.sm, padding: 12, marginTop: 10 },
  q: { color: colors.nightMuted, fontSize: 11, letterSpacing: 1 },
  a: { color: colors.nightInk, fontSize: 16, marginTop: 3 },
  share: { ...buttonBase, backgroundColor: colors.brand, marginTop: 18 },
  sharePressed: { backgroundColor: colors.brandDeep },
  shareText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  empty: { color: colors.nightMuted, textAlign: 'center', paddingHorizontal: 40, fontSize: 16 },
  close: { position: 'absolute', top: 58, right: 22, width: 44, height: 44, borderRadius: 22,
           backgroundColor: 'rgba(255,255,255,.15)', alignItems: 'center', justifyContent: 'center' },
  closePressed: { backgroundColor: 'rgba(255,255,255,.25)' },
  closeText: { color: colors.nightInk, fontSize: 17 },
});
