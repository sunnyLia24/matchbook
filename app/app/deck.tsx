import { useEffect, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { WEB_BASE_URL } from '../src/lib/config';
import { Friend } from '../src/types';
import { colors, radii, buttonBase, brandGlow } from '../src/theme';

const { width: W } = Dimensions.get('window');

const share = (f: Friend) =>
  Share.share({ message: `Meet ${f.first_name} 🔥 ${WEB_BASE_URL}/p/${f.share_slug}` });

export default function Deck() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const router = useRouter();
  const { gender } = useLocalSearchParams<{ gender?: string }>();

  useEffect(() => {
    let q = supabase.from('friends').select('*').eq('status', 'single').eq('consented', true);
    if (gender) q = q.eq('gender', gender);
    q.order('created_at').then(({ data }) => setFriends((data as Friend[]) ?? []));
  }, [gender]);

  return (
    <View style={s.wrap}>
      <FlatList
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        data={friends} keyExtractor={(f) => f.id}
        ListEmptyComponent={<View style={{ width: W, justifyContent: 'center' }}>
          <Text style={s.empty}>No live profiles — check status + consent.</Text></View>}
        renderItem={({ item }) => <DeckCard friend={item} />}
      />
      <Pressable style={({ pressed }) => [s.close, pressed && s.closePressed]} onPress={() => router.back()} hitSlop={8}>
        <Text style={s.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

function DeckCard({ friend }: { friend: Friend }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = friend.photos ?? [];
  const step = (d: number) => setPhotoIndex((i) => (i + d + photos.length) % photos.length);

  return (
    <View style={s.card}>
      {/* Full-bleed hero: photo edge-to-edge, name overlaid on a scrim (matches web /p/).
          2+ photos: stories-style tap zones (right = next, left = back) + segment bars —
          taps, not swipes, so the outer FlatList keeps horizontal paging between friends. */}
      <View style={s.hero}>
        {photos[photoIndex]
          ? <Image source={{ uri: photos[photoIndex] }} style={s.photo} />
          : <View style={[s.photo, s.noPhoto]}><Text style={{ fontSize: 60 }}>💘</Text></View>}
        <LinearGradient
          colors={['transparent', 'rgba(16,10,19,0.55)', colors.night]}
          locations={[0, 0.55, 1]}
          style={s.scrim}
        />
        {photos.length > 1 && (
          <>
            <Pressable style={[s.tapZone, { left: 0 }]} onPress={() => step(-1)} />
            <Pressable style={[s.tapZone, { right: 0 }]} onPress={() => step(1)} />
            <View style={s.segs}>
              {photos.map((url, i) => (
                <View key={url} style={[s.seg, i === photoIndex && s.segOn]} />
              ))}
            </View>
          </>
        )}
        <View style={s.id} pointerEvents="none">
          <Text style={s.name}>
            {friend.first_name}
            {friend.age ? <Text style={s.age}>  {friend.age}</Text> : null}
          </Text>
          {!!(friend.city || friend.job) && (
            <Text style={s.city}>{[friend.city, friend.job].filter(Boolean).join(' · ')}</Text>
          )}
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {!!friend.pitch && (
          <View style={s.pitchWrap}>
            <Text style={s.quoteMark}>“</Text>
            <Text style={s.pitch}>{friend.pitch}</Text>
          </View>
        )}
        {(friend.prompts ?? []).slice(0, 2).map((p) => (
          <View key={p.q} style={s.prompt}>
            <Text style={s.q}>{p.q.toUpperCase()}</Text><Text style={s.a}>{p.a}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={s.footer}>
        <Pressable style={({ pressed }) => [s.share, pressed && s.sharePressed]} onPress={() => share(friend)}>
          <Text style={s.shareText}>Share {friend.first_name}’s profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.night },
  card: { width: W, flex: 1 },
  hero: { width: W },
  photo: { width: W, aspectRatio: 4 / 5, backgroundColor: colors.nightElevated },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  tapZone: { position: 'absolute', top: 0, bottom: 0, width: '50%' },
  segs: { position: 'absolute', top: 60, left: 16, right: 74, flexDirection: 'row', gap: 5 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(244,237,246,0.28)' },
  segOn: { backgroundColor: colors.champagne },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  id: { position: 'absolute', left: 20, right: 20, bottom: 12 },
  name: { color: colors.nightInk, fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  age: { color: colors.nightMuted, fontSize: 26, fontWeight: '400', letterSpacing: 0 },
  city: { color: colors.nightMuted, fontSize: 15, fontWeight: '500', marginTop: 2 },
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  pitchWrap: { flexDirection: 'row' },
  quoteMark: { color: colors.champagne, fontSize: 34, fontWeight: '800', lineHeight: 34, marginRight: 4 },
  pitch: { flex: 1, color: colors.nightInk, fontSize: 18, fontWeight: '500', marginTop: 6, lineHeight: 25 },
  prompt: { backgroundColor: colors.nightElevated, borderRadius: radii.sm, padding: 12, marginTop: 10 },
  q: { color: colors.nightMuted, fontSize: 11, letterSpacing: 1 },
  a: { color: colors.nightInk, fontSize: 16, marginTop: 3 },
  footer: { paddingHorizontal: 20, paddingBottom: 34, paddingTop: 8 },
  share: { ...buttonBase, backgroundColor: colors.brand, ...brandGlow },
  sharePressed: { backgroundColor: colors.brandDeep },
  shareText: { color: colors.onBrand, fontSize: 17, fontWeight: '700' },
  empty: { color: colors.nightMuted, textAlign: 'center', paddingHorizontal: 40, fontSize: 16 },
  close: { position: 'absolute', top: 58, right: 22, width: 44, height: 44, borderRadius: 22,
           backgroundColor: 'rgba(16,10,19,0.45)', alignItems: 'center', justifyContent: 'center' },
  closePressed: { backgroundColor: 'rgba(16,10,19,0.7)' },
  closeText: { color: colors.nightInk, fontSize: 17 },
});
