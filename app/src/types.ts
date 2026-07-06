export type Prompt = { q: string; a: string };
export type Friend = {
  id: string; first_name: string; age: number | null; city: string | null;
  pitch: string | null; prompts: Prompt[]; looking_for: string | null;
  photos: string[]; status: 'single' | 'taken' | 'hidden';
  consented: boolean; share_slug: string;
};
export type ChatMeta = {
  id: string; friend_id: string; status: 'active' | 'ended';
  ended_by: 'guest' | 'friend' | null; friend_token: string;
  created_at: string; ended_at: string | null;
};
