import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { colors, radii, spacing, buttonBase } from '../../src/theme';

export default function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (mode === 'up' && !name.trim()) return Alert.alert('Hmm', 'Add your name — your friends’ matches see it on chat invites.');
    setBusy(true);
    const { data, error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    if (!error && mode === 'up' && data.user) {
      // shown to friends on the chat intro screen: "<name> vouches for this"
      await supabase.from('wingpeople').update({ display_name: name.trim() }).eq('id', data.user.id);
    }
    setBusy(false);
    if (error) Alert.alert('Hmm', error.message);
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.logo}>Matchbook 🔥</Text>
      <Text style={s.tag}>Your single friends deserve better PR.</Text>
      {mode === 'up' && (
        <TextInput style={s.input} placeholder="Your name (shown on chat invites)" placeholderTextColor={colors.muted}
          value={name} onChangeText={setName} />
      )}
      <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed]} disabled={busy} onPress={go}>
        <Text style={s.btnText}>{mode === 'in' ? 'Sign in' : 'Create account'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')} hitSlop={8}>
        <Text style={s.switch}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 28, gap: spacing.md },
  logo: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5, color: colors.ink, textAlign: 'center' },
  tag: { color: colors.muted, textAlign: 'center', marginBottom: 18, fontSize: 16 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm,
           padding: 15, fontSize: 16, color: colors.ink },
  btn: { ...buttonBase, backgroundColor: colors.brand, marginTop: 6 },
  btnPressed: { backgroundColor: colors.brandDeep },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  switch: { color: colors.brand, textAlign: 'center', marginTop: 14, fontSize: 15, paddingVertical: spacing.sm },
});
