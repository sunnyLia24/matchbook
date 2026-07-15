import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { Friend, Gender } from '../../src/types';
import { colors, radii, spacing, buttonBase, cardBase, brandGlow } from '../../src/theme';

export default function Roster() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [needsName, setNeedsName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const router = useRouter();

  type GenderFilter = 'all' | Gender;
  const FILTER_LABELS: Record<GenderFilter, string> = {
    all: 'All', guy: 'Guys', girl: 'Girls', nonbinary: 'Enby',
  };
  const [filter, setFilter] = useState<GenderFilter>('all');
  const hasEnby = friends.some((f) => f.gender === 'nonbinary');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (filter === 'nonbinary' && !hasEnby) setFilter('all');
  }, [filter, hasEnby]);
  const filters: GenderFilter[] = hasEnby ? ['all', 'guy', 'girl', 'nonbinary'] : ['all', 'guy', 'girl'];
  const shown = filter === 'all' ? friends : friends.filter((f) => f.gender === filter);

  useFocusEffect(useCallback(() => {
    supabase.from('friends').select('*').order('created_at')
      .then(({ data }) => setFriends((data as Friend[]) ?? []));
    supabase.from('wingpeople').select('display_name').single()
      .then(({ data }) => setNeedsName(!!data && !data.display_name));
  }, []));

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('wingpeople').update({ display_name: trimmed }).eq('id', user.id);
    if (error) Alert.alert('Hmm', error.message);
    else setNeedsName(false);
  };

  return (
    <View style={s.wrap}>
      {needsName && (
        <View style={s.nameCard}>
          <Text style={s.nameCardText}>What’s your name? Your friends’ matches see it on chat invites.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput style={s.nameInput} placeholder="Your name" placeholderTextColor={colors.muted} keyboardAppearance="dark"
              value={nameDraft} onChangeText={setNameDraft} />
            <Pressable style={({ pressed }) => [s.nameSave, pressed && s.nameSavePressed]} onPress={saveName}>
              <Text style={s.nameSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      )}
      {friends.length > 0 && (
        <View style={s.filterRow}>
          {filters.map((g) => (
            <Pressable key={g} style={[s.filterChip, filter === g && s.filterChipOn]} onPress={() => setFilter(g)}>
              <Text style={filter === g ? s.filterChipOnText : s.filterChipText}>{FILTER_LABELS[g]}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <FlatList
        data={shown}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text style={s.empty}>
          {filter === 'all'
            ? 'Add your first single friend 💘'
            : `No ${FILTER_LABELS[filter].toLowerCase()} on your roster yet 💔`}
        </Text>}
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
        <Pressable style={({ pressed }) => [s.deckBtn, pressed && s.deckBtnPressed]}
          onPress={() => router.push(filter === 'all' ? '/deck' : `/deck?gender=${filter}`)}>
          <Text style={s.deckText}>
            🎉 Party mode{filter !== 'all' ? ` · ${FILTER_LABELS[filter].toLowerCase()}` : ''}
          </Text>
        </Pressable>
      )}
      <Pressable style={({ pressed }) => [s.add, pressed && s.addPressed]} onPress={() => router.push('/friend/new')}>
        <Text style={{ color: colors.onBrand, fontSize: 30, lineHeight: 32 }}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 60, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...cardBase, padding: spacing.md },
  rowPressed: { backgroundColor: colors.elevated },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarEmpty: { backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2, color: colors.ink },
  pitch: { color: colors.muted, marginTop: 2 },
  badge: { fontSize: 12, color: colors.brand, fontWeight: '600', textTransform: 'lowercase' },
  badgeOff: { color: colors.muted },
  deckBtn: { ...buttonBase, position: 'absolute', bottom: 24, alignSelf: 'center', minHeight: 0,
             backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.line,
             paddingVertical: 14, paddingHorizontal: 26, borderRadius: radii.pill },
  deckBtnPressed: { opacity: 0.85 },
  deckText: { color: colors.champagne, fontSize: 17, fontWeight: '700' },
  add: { position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26,
         backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', ...brandGlow },
  addPressed: { backgroundColor: colors.brandDeep },
  nameCard: { ...cardBase, margin: 16, marginBottom: 0, padding: spacing.lg, gap: spacing.md },
  nameCardText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  nameInput: { flex: 1, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm,
               paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink },
  nameSave: { backgroundColor: colors.brand, borderRadius: radii.sm, paddingHorizontal: 18, justifyContent: 'center' },
  nameSavePressed: { backgroundColor: colors.brandDeep },
  nameSaveText: { color: colors.onBrand, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filterChip: { minHeight: 32, borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill,
                paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  filterChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterChipText: { color: colors.muted, fontWeight: '600' },
  filterChipOnText: { color: colors.onBrand, fontWeight: '700' },
});
