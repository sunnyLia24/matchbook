import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const PICKER_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 5],
};

// Take-or-upload chooser shared by the roster editor and the suitor-card sheet.
// Resolves to a local image uri, or null if the user bails or denies the camera.
export function pickPhotoUri(): Promise<string | null> {
  return new Promise((resolve) => {
    const finish = (r: ImagePicker.ImagePickerResult) =>
      resolve(r.canceled ? null : r.assets[0].uri);
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera access is off', 'Turn it on in Settings to snap one on the spot.');
          return resolve(null);
        }
        finish(await ImagePicker.launchCameraAsync(PICKER_OPTS));
      } },
      { text: 'Choose from library', onPress: async () => finish(await ImagePicker.launchImageLibraryAsync(PICKER_OPTS)) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

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
