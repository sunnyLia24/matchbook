import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch,
         Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { pickPhotoUri, uploadPhoto } from '../../src/lib/photos';
import { Friend, Prompt } from '../../src/types';
import { colors, radii, spacing, buttonBase, brandGlow } from '../../src/theme';

// Fun, on-voice prompt library — wingpeople pick up to 3.
const PROMPT_LIBRARY = [
  'Ideal Sunday', 'Green flag they wave', 'Will win you over with',
  'Their toxic trait (endearing)', 'Best meal they cook', 'Karaoke go-to',
  'Weirdly good at', 'Perfect first date', 'Hill they’ll die on',
  'Most likely to cry at', 'Their villain origin story', 'Their love language',
];
const MAX_PROMPTS = 3;

export default function FriendEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [interestsDraft, setInterestsDraft] = useState('');
  const [f, setF] = useState<Partial<Friend>>({
    first_name: '', prompts: [], photos: [],
    status: 'single', consented: false,
  });

  useEffect(() => {
    if (!isNew) supabase.from('friends').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (!data) return;
        setF(data as Friend);
        setInterestsDraft(((data as Friend).interests ?? []).join(', '));
      });
  }, [id, isNew]);

  const set = (patch: Partial<Friend>) => setF((p) => ({ ...p, ...patch }));

  const addPhoto = async () => {
    const uri = await pickPhotoUri();
    if (!uri) return;
    setBusy(true);
    try { set({ photos: [...(f.photos ?? []), await uploadPhoto(uri)] }); }
    catch (e: any) { Alert.alert('Upload failed', e.message); }
    setBusy(false);
  };

  const save = async () => {
    if (!f.first_name?.trim()) return Alert.alert('Needs a name');
    setBusy(true);
    const row = {
      first_name: f.first_name.trim(), age: f.age || null, city: f.city || null,
      pitch: f.pitch || null, looking_for: f.looking_for || null,
      prompts: (f.prompts ?? []).filter((p: Prompt) => p.a.trim()),
      photos: f.photos ?? [], status: f.status, consented: f.consented,
      job: f.job?.trim() || null, height: f.height?.trim() || null,
      interests: interestsDraft.split(',').map((s) => s.trim()).filter(Boolean),
      gender: f.gender ?? null,
    };
    const q = isNew
      ? supabase.from('friends').insert({ ...row, owner_id: (await supabase.auth.getUser()).data.user!.id })
      : supabase.from('friends').update(row).eq('id', id);
    const { error } = await q;
    setBusy(false);
    if (error) return Alert.alert('Save failed', error.message);
    router.back();
  };

  const remove = () => Alert.alert('Remove from roster?', 'Their profile link and chats stop working immediately.',
    [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => {
      await supabase.from('friends').delete().eq('id', id); router.back(); } }]);

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
        {(f.photos ?? []).map((url) => (
          <Pressable key={url} onLongPress={() => set({ photos: f.photos!.filter((u) => u !== url) })}>
            <Image source={{ uri: url }} style={s.photo} />
          </Pressable>
        ))}
        {(f.photos ?? []).length < 4 && (
          <Pressable style={[s.photo, s.photoAdd]} onPress={addPhoto} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.muted} /> : <Text style={{ fontSize: 30, color: colors.muted }}>+</Text>}
          </Pressable>
        )}
      </ScrollView>
      <Text style={s.hint}>Long-press a photo to remove it.</Text>
      <TextInput style={s.input} placeholder="First name" placeholderTextColor={colors.muted} keyboardAppearance="dark" value={f.first_name}
        onChangeText={(t) => set({ first_name: t })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Age" placeholderTextColor={colors.muted} keyboardAppearance="dark" keyboardType="number-pad"
          value={f.age ? String(f.age) : ''} onChangeText={(t) => set({ age: parseInt(t) || null })} />
        <TextInput style={[s.input, { flex: 2 }]} placeholder="City" placeholderTextColor={colors.muted} keyboardAppearance="dark" value={f.city ?? ''}
          onChangeText={(t) => set({ city: t })} />
      </View>
      <View style={s.rowBetween}>
        <Text style={s.label}>Gender</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['guy', 'girl', 'nonbinary'] as const).map((g) => (
            <Pressable key={g} style={[s.chip, f.gender === g && s.chipOn]}
              onPress={() => set({ gender: f.gender === g ? null : g })}>
              <Text style={f.gender === g ? s.chipOnText : s.chipText}>{g}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TextInput style={[s.input, { flex: 2 }]} placeholder="Job" placeholderTextColor={colors.muted} keyboardAppearance="dark"
          value={f.job ?? ''} onChangeText={(t) => set({ job: t })} />
        <TextInput style={[s.input, { flex: 1 }]} placeholder={'Height (5′9″)'} placeholderTextColor={colors.muted} keyboardAppearance="dark"
          value={f.height ?? ''} onChangeText={(t) => set({ height: t })} />
      </View>
      <TextInput style={s.input} placeholder="Interests — comma separated (mahjong, hot pot, F1)" placeholderTextColor={colors.muted} keyboardAppearance="dark"
        value={interestsDraft} onChangeText={setInterestsDraft} />
      <TextInput style={[s.input, s.multi]} multiline placeholder="The pitch — why are they a catch?" placeholderTextColor={colors.muted} keyboardAppearance="dark"
        value={f.pitch ?? ''} onChangeText={(t) => set({ pitch: t })} />
      {(f.prompts ?? []).map((p: Prompt, i: number) => (
        <View key={p.q}>
          <View style={s.promptHead}>
            <Text style={s.label}>{p.q}</Text>
            <Pressable hitSlop={10} onPress={() => set({ prompts: f.prompts!.filter((x) => x.q !== p.q) })}>
              <Text style={s.promptRemove}>Remove</Text>
            </Pressable>
          </View>
          <TextInput style={s.input} value={p.a} placeholder="Their answer…" placeholderTextColor={colors.muted} keyboardAppearance="dark"
            onChangeText={(t) => { const ps = [...f.prompts!]; ps[i] = { ...p, a: t }; set({ prompts: ps }); }} />
        </View>
      ))}
      {(f.prompts ?? []).length < MAX_PROMPTS && (
        <View>
          <Text style={s.label}>Add a prompt ({(f.prompts ?? []).length}/{MAX_PROMPTS})</Text>
          <View style={s.promptChips}>
            {PROMPT_LIBRARY.filter((q) => !(f.prompts ?? []).some((p) => p.q === q)).map((q) => (
              <Pressable key={q} style={({ pressed }) => [s.chip, pressed && s.chipPressed]}
                onPress={() => set({ prompts: [...(f.prompts ?? []), { q, a: '' }] })}>
                <Text style={s.chipText}>+ {q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <TextInput style={s.input} placeholder="Looking for…" placeholderTextColor={colors.muted} keyboardAppearance="dark" value={f.looking_for ?? ''}
        onChangeText={(t) => set({ looking_for: t })} />
      <View style={s.rowBetween}>
        <Text style={s.label}>They know they’re on here</Text>
        <Switch value={!!f.consented} onValueChange={(v) => set({ consented: v })}
          trackColor={{ true: colors.brand, false: colors.line }} thumbColor={colors.white} />
      </View>
      <View style={s.rowBetween}>
        <Text style={s.label}>Status</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['single', 'taken', 'hidden'] as const).map((st) => (
            <Pressable key={st} style={[s.chip, f.status === st && s.chipOn]} onPress={() => set({ status: st })}>
              <Text style={f.status === st ? s.chipOnText : s.chipText}>{st}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable style={({ pressed }) => [s.save, pressed && s.savePressed]} onPress={save} disabled={busy}>
        <Text style={s.saveText}>{isNew ? 'Add to roster' : 'Save'}</Text>
      </Pressable>
      {!isNew && <Pressable onPress={remove} hitSlop={8}><Text style={s.remove}>Remove from roster</Text></Pressable>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  photo: { width: 96, height: 120, borderRadius: radii.sm, backgroundColor: colors.elevated },
  photoAdd: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
              borderStyle: 'dashed' },
  hint: { fontSize: 12, color: colors.muted },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm,
           padding: 13, fontSize: 16, color: colors.ink },
  multi: { minHeight: 80 },
  label: { fontSize: 14, color: colors.muted, marginBottom: 6, fontWeight: '600' },
  promptHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  promptRemove: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  promptChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  chip: { minHeight: 32, borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, paddingVertical: 6,
          paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipPressed: { backgroundColor: colors.elevated },
  chipText: { color: colors.muted }, chipOnText: { color: colors.onBrand, fontWeight: '700' },
  save: { ...buttonBase, backgroundColor: colors.brand, marginTop: 10, ...brandGlow },
  savePressed: { backgroundColor: colors.brandDeep },
  saveText: { color: colors.onBrand, fontSize: 17, fontWeight: '700' },
  remove: { color: colors.muted, textAlign: 'center', marginTop: 16, paddingVertical: spacing.sm, fontSize: 15 },
});
