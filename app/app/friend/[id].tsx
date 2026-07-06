import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch,
         Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import { uploadPhoto } from '../../src/lib/photos';
import { Friend, Prompt } from '../../src/types';
import { colors, radii, spacing, buttonBase } from '../../src/theme';

const PROMPT_QS = ['Ideal Sunday', 'Green flag they wave', 'Will win you over with'];

export default function FriendEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Partial<Friend>>({
    first_name: '', prompts: PROMPT_QS.map((q) => ({ q, a: '' })), photos: [],
    status: 'single', consented: false,
  });

  useEffect(() => {
    if (!isNew) supabase.from('friends').select('*').eq('id', id).single()
      .then(({ data }) => data && setF(data as Friend));
  }, [id]);

  const set = (patch: Partial<Friend>) => setF((p) => ({ ...p, ...patch }));

  const addPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7,
      allowsEditing: true, aspect: [4, 5] });
    if (r.canceled) return;
    setBusy(true);
    try { set({ photos: [...(f.photos ?? []), await uploadPhoto(r.assets[0].uri)] }); }
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
      <TextInput style={s.input} placeholder="First name" placeholderTextColor={colors.muted} value={f.first_name}
        onChangeText={(t) => set({ first_name: t })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Age" placeholderTextColor={colors.muted} keyboardType="number-pad"
          value={f.age ? String(f.age) : ''} onChangeText={(t) => set({ age: parseInt(t) || null })} />
        <TextInput style={[s.input, { flex: 2 }]} placeholder="City" placeholderTextColor={colors.muted} value={f.city ?? ''}
          onChangeText={(t) => set({ city: t })} />
      </View>
      <TextInput style={[s.input, s.multi]} multiline placeholder="The pitch — why are they a catch?" placeholderTextColor={colors.muted}
        value={f.pitch ?? ''} onChangeText={(t) => set({ pitch: t })} />
      {(f.prompts ?? []).map((p: Prompt, i: number) => (
        <View key={p.q}>
          <Text style={s.label}>{p.q}</Text>
          <TextInput style={s.input} value={p.a} placeholder="Their answer…" placeholderTextColor={colors.muted}
            onChangeText={(t) => { const ps = [...f.prompts!]; ps[i] = { ...p, a: t }; set({ prompts: ps }); }} />
        </View>
      ))}
      <TextInput style={s.input} placeholder="Looking for…" placeholderTextColor={colors.muted} value={f.looking_for ?? ''}
        onChangeText={(t) => set({ looking_for: t })} />
      <View style={s.rowBetween}>
        <Text style={s.label}>They know they're on here</Text>
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
  photo: { width: 96, height: 120, borderRadius: radii.sm, backgroundColor: colors.line },
  photoAdd: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
              borderStyle: 'dashed' },
  hint: { fontSize: 12, color: colors.muted },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm,
           padding: 13, fontSize: 16, color: colors.ink },
  multi: { minHeight: 80 },
  label: { fontSize: 14, color: colors.muted, marginBottom: 6, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  chip: { minHeight: 32, borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, paddingVertical: 6,
          paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.muted }, chipOnText: { color: colors.white, fontWeight: '600' },
  save: { ...buttonBase, backgroundColor: colors.brand, marginTop: 10 },
  savePressed: { backgroundColor: colors.brandDeep },
  saveText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  remove: { color: colors.muted, textAlign: 'center', marginTop: 16, paddingVertical: spacing.sm, fontSize: 15 },
});
