import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, StyleSheet,
         Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../src/lib/supabase';
import { uploadPhoto } from '../src/lib/photos';
import { WEB_BASE_URL } from '../src/lib/config';
import { SuitorCard } from '../src/types';
import { colors, radii, spacing, buttonBase, brandGlow, cardBase } from '../src/theme';

// On-voice vouch reasons the wingperson taps at the party.
const VOUCH_TAGS = ['funny', 'has a good job', 'your type', 'tall', 'great style',
                    'good texter', 'friend of a friend', 'certified normal'];
const IG_RE = /^[A-Za-z0-9._]{1,30}$/;

export default function SuitorCardSheet() {
  const { chat, token, name } = useLocalSearchParams<{ chat: string; token: string; name: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [suitorName, setSuitorName] = useState('');
  const [ig, setIg] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');

  // Re-opening the sheet pre-fills the existing card (fix a typo, add the photo).
  useEffect(() => {
    supabase.from('chats').select('suitor_card').eq('id', chat).single().then(({ data }) => {
      const c = (data?.suitor_card ?? null) as SuitorCard | null;
      if (!c) return;
      setPhoto(c.photo ?? null); setSuitorName(c.name ?? '');
      setIg(c.ig ?? ''); setTags(c.tags ?? []);
    });
  }, [chat]);

  const toggle = (t: string) =>
    setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7,
      allowsEditing: true, aspect: [4, 5] });
    if (r.canceled) return;
    setBusy(true);
    try { setPhoto(await uploadPhoto(r.assets[0].uri)); }
    catch (e: any) { Alert.alert('Upload failed', e.message); }
    setBusy(false);
  };

  // Forwarding the link is the sacred path: a failed save never blocks the share.
  const share = async (withCard: boolean) => {
    setSharing(true);
    if (withCard) {
      const card: SuitorCard = {};
      if (photo) card.photo = photo;
      if (suitorName.trim()) card.name = suitorName.trim();
      const handle = ig.trim().replace(/^@/, '');
      if (handle && !IG_RE.test(handle)) {
        setSharing(false);
        return Alert.alert('That Instagram handle doesn’t look right',
          'Letters, numbers, dots and underscores only.');
      }
      if (handle) card.ig = handle;
      const all = [...new Set([...tags, customTag.trim()].filter(Boolean))];
      if (all.length) card.tags = all;
      const { error } = await supabase.from('chats')
        .update({ suitor_card: Object.keys(card).length ? card : null }).eq('id', chat);
      if (error) Alert.alert('Card didn’t save', `${error.message}\nSharing the link anyway.`);
    }
    await Share.share({
      message: `Someone met you through me and wants to chat 👀 Your private Matchbook link (type STOP anytime to end it): ${WEB_BASE_URL}/c/${token}`,
    });
    setSharing(false);
    router.back();
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
                keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Who did they meet?</Text>
      <Text style={s.sub}>Give {name || 'your friend'} a peek before they say yes. Everything’s optional.</Text>

      <Pressable style={[s.photo, !photo && s.photoAdd]} onPress={pickPhoto} disabled={busy}>
        {photo ? <Image source={{ uri: photo }} style={s.photo} />
               : busy ? <ActivityIndicator color={colors.muted} />
                      : <Text style={s.photoHint}>+ add their photo</Text>}
      </Pressable>

      <TextInput style={s.input} placeholder="Their first name" placeholderTextColor={colors.muted}
        value={suitorName} onChangeText={setSuitorName} autoCapitalize="words" />
      <View style={s.igRow}>
        <Text style={s.at}>@</Text>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="their.instagram"
          placeholderTextColor={colors.muted} value={ig} onChangeText={setIg}
          autoCapitalize="none" autoCorrect={false} />
      </View>

      <Text style={s.label}>Why you’re introducing them</Text>
      <View style={s.chips}>
        {VOUCH_TAGS.map((t) => (
          <Pressable key={t} onPress={() => toggle(t)}
            style={[s.chip, tags.includes(t) && s.chipOn]}>
            <Text style={[s.chipText, tags.includes(t) && s.chipTextOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={s.input} placeholder="add your own…" placeholderTextColor={colors.muted}
        value={customTag} onChangeText={setCustomTag} autoCapitalize="none"
        onSubmitEditing={() => { const t = customTag.trim();
          if (t) { setTags((p) => (p.includes(t) ? p : [...p, t])); setCustomTag(''); } }} />

      <Pressable style={({ pressed }) => [s.primary, pressed && { backgroundColor: colors.brandDeep }]}
        onPress={() => share(true)} disabled={sharing || busy}>
        {sharing ? <ActivityIndicator color={colors.onBrand} />
                 : <Text style={s.primaryText}>Share the link</Text>}
      </Pressable>
      <Pressable style={s.skip} onPress={() => share(false)} disabled={sharing}>
        <Text style={s.skipText}>Skip — just share the link</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, color: colors.ink },
  sub: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  photo: { width: 120, height: 150, borderRadius: radii.md, backgroundColor: colors.elevated,
           alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoAdd: { borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  photoHint: { color: colors.muted, fontSize: 13 },
  input: { ...cardBase, borderRadius: radii.md, color: colors.ink, paddingHorizontal: 14,
           paddingVertical: 12, fontSize: 16 },
  igRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  at: { color: colors.muted, fontSize: 18, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase',
           letterSpacing: 0.6, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line,
          backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: colors.onBrand },
  primary: { ...buttonBase, ...brandGlow, backgroundColor: colors.brand, marginTop: 10 },
  primaryText: { color: colors.onBrand, fontWeight: '800', fontSize: 17 },
  skip: { ...buttonBase, minHeight: 44 },
  skipText: { color: colors.muted, fontWeight: '500', fontSize: 15 },
});
