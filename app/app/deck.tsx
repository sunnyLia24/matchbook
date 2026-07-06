import { useEffect, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { WEB_BASE_URL } from '../src/lib/config';
import { Friend } from '../src/types';

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
            {!!item.pitch && <Text style={s.pitch}>"{item.pitch}"</Text>}
            {(item.prompts ?? []).slice(0, 2).map((p) => (
              <View key={p.q} style={s.prompt}>
                <Text style={s.q}>{p.q.toUpperCase()}</Text><Text style={s.a}>{p.a}</Text>
              </View>
            ))}
            <Pressable style={s.share} onPress={() => share(item)}>
              <Text style={s.shareText}>Share {item.first_name}'s profile</Text>
            </Pressable>
          </View>
        )}
      />
      <Pressable style={s.close} onPress={() => router.back()}><Text style={s.closeText}>✕</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#2b2018' },
  card: { width: W, padding: 24, paddingTop: 70 },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 24, backgroundColor: '#463a2e' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 34, fontWeight: '700', marginTop: 16 },
  city: { color: '#c9b8a5', fontSize: 16, marginTop: 2 },
  pitch: { color: '#f5e9db', fontSize: 17, marginTop: 10, lineHeight: 24 },
  prompt: { backgroundColor: '#3a2e23', borderRadius: 14, padding: 12, marginTop: 10 },
  q: { color: '#a4937f', fontSize: 11, letterSpacing: 1 },
  a: { color: '#f5e9db', fontSize: 16, marginTop: 3 },
  share: { backgroundColor: '#c4553d', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 18 },
  shareText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  empty: { color: '#c9b8a5', textAlign: 'center', paddingHorizontal: 40, fontSize: 16 },
  close: { position: 'absolute', top: 58, right: 22, width: 36, height: 36, borderRadius: 18,
           backgroundColor: 'rgba(255,255,255,.15)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 17 },
});
