import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export async function uploadPhoto(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const ext = uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  const path = `${user.id}/${Crypto.randomUUID()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const { error } = await supabase.storage.from('photos')
    .upload(path, decode(base64), { contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}
