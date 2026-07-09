import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { WEB_BASE_URL } from '../src/lib/config';
import { colors, radii, spacing, buttonBase, cardBase } from '../src/theme';

const LINKS = [
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Terms of Use', path: '/terms' },
  { label: 'Support', path: '/support' },
] as const;

export default function Settings() {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
    supabase.from('wingpeople').select('display_name').single().then(({ data }) => {
      setName(data?.display_name ?? '');
      setSavedName(data?.display_name ?? '');
    });
  }, []);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedName) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('wingpeople').update({ display_name: trimmed }).eq('id', user.id);
    if (error) Alert.alert('Hmm', error.message);
    else setSavedName(trimmed);
  };

  const signOut = () => supabase.auth.signOut();

  // Deleting the auth user server-side cascades roster, photos, and chats;
  // the local signOut just clears the now-orphaned session.
  const deleteAccount = () => Alert.prompt(
    'Delete your account?',
    'Your roster, photos, and every chat disappear permanently. Type DELETE to confirm.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete forever', style: 'destructive', onPress: async (typed?: string) => {
        if ((typed ?? '').trim().toUpperCase() !== 'DELETE') {
          return Alert.alert('Not deleted', 'Type DELETE to confirm — it’s permanent.');
        }
        setBusy(true);
        const { error } = await supabase.rpc('delete_account');
        setBusy(false);
        if (error) return Alert.alert('That didn’t work', error.message);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      } },
    ],
    'plain-text',
  );

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
      <Text style={s.label}>Your name — shown on chat invites</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TextInput style={s.input} placeholder="Your name" placeholderTextColor={colors.muted}
          keyboardAppearance="dark" value={name} onChangeText={setName} onBlur={saveName} />
        {name.trim() !== savedName && name.trim() !== '' && (
          <Pressable style={({ pressed }) => [s.saveBtn, pressed && s.saveBtnPressed]} onPress={saveName}>
            <Text style={s.saveText}>Save</Text>
          </Pressable>
        )}
      </View>
      {!!email && <Text style={s.meta}>Signed in as {email}</Text>}

      <View style={s.linkCard}>
        {LINKS.map((l, i) => (
          <Pressable key={l.path} style={({ pressed }) => [s.linkRow, i > 0 && s.linkRowDivider, pressed && s.linkRowPressed]}
            onPress={() => Linking.openURL(WEB_BASE_URL + l.path)}>
            <Text style={s.linkText}>{l.label}</Text>
            <Text style={s.linkChevron}>↗</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={({ pressed }) => [s.signOut, pressed && s.signOutPressed]} onPress={signOut}>
        <Text style={s.signOutText}>Sign out</Text>
      </Pressable>

      <Pressable onPress={deleteAccount} disabled={busy} hitSlop={8}>
        <Text style={s.delete}>{busy ? 'Deleting…' : 'Delete account'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  input: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm,
           padding: 13, fontSize: 16, color: colors.ink },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radii.sm, paddingHorizontal: 18, justifyContent: 'center' },
  saveBtnPressed: { backgroundColor: colors.brandDeep },
  saveText: { color: colors.onBrand, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13 },
  linkCard: { ...cardBase, marginTop: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
             paddingHorizontal: spacing.lg, minHeight: 52 },
  linkRowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  linkRowPressed: { backgroundColor: colors.elevated },
  linkText: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  linkChevron: { color: colors.muted, fontSize: 15 },
  signOut: { ...buttonBase, marginTop: 12, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.line },
  signOutPressed: { opacity: 0.85 },
  signOutText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  delete: { color: colors.muted, textAlign: 'center', marginTop: 16, paddingVertical: spacing.sm, fontSize: 15 },
});
