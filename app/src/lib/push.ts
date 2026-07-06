import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export async function registerPush() {
  try {
    if (!Device.isDevice) return; // simulator: skip
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await supabase.from('wingpeople').update({ expo_push_token: token })
      .eq('id', (await supabase.auth.getUser()).data.user!.id);
  } catch {
    // non-fatal: chats still appear in the Chats tab
  }
}
