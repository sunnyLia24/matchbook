# Suitor Card — Design

*2026-07-08. Approved in brainstorming; backend section adversarially QA'd by an independent agent (verdict: APPROVE-WITH-CHANGES; all required changes incorporated below).*

## What & why

When the wingman forwards a friend's chat link (after a guest says hi), they can optionally attach a **suitor card** — a photo of the person, their first name, their Instagram handle, and tapped-off **vouch reasons** ("funny", "has a good job", "your type"). The friend sees the card at the intro gate before choosing to enter, so they can scope out who they're about to chat with. Everything is optional; with no card, the flow looks exactly like today.

Product decisions made in brainstorming:

- **Vouch reasons are preset chips + one custom entry**, not free-form prompts — fast to tap at a party, on-brand voice.
- **Entry moment:** a sheet appears when the wingman taps Forward, before the share sheet. Re-tapping Forward reopens it pre-filled (edit path).
- **Friend-only:** the guest never sees their own card, enforced server-side in `get_chat`, not in the browser.
- Optional **first name** field so the gate reads "Lia vouches for Dan."

## 1. Backend — migration `008_suitor_card.sql`

**Column.** `alter table public.chats add column if not exists suitor_card jsonb` (nullable; `null` = no card). Canonical shape:

```json
{ "name": "Dan", "photo": "https://<ref>.supabase.co/storage/v1/object/public/photos/<uid>/<uuid>.jpg", "ig": "dan.example", "tags": ["funny", "has a good job"] }
```

**Shape CHECK constraint** (QA finding 4/6 — the column crosses a trust boundary into the friend's browser). Guarded with `drop constraint if exists` first. The constraint requires, when `suitor_card` is not null:

- `jsonb_typeof(suitor_card) = 'object'`
- key whitelist: `suitor_card - 'name' - 'photo' - 'ig' - 'tags' = '{}'::jsonb`
- `name`, `photo`, `ig` are jsonb strings when present; `tags` is a jsonb array when present
- `suitor_card->>'ig'` matches `^[A-Za-z0-9._]{1,30}$` when present (Instagram's charset)
- `suitor_card->>'photo'` starts with this project's storage public prefix (`https://gyhqbnyuufntgdmowrbi.supabase.co/storage/v1/object/public/photos/`) when present — prevents an arbitrary `img.src` from leaking the friend's IP to a third-party server on page load
- `pg_column_size(suitor_card) < 2048`

**Write path (wingman).** No new RPC. New RLS policy, preceded by `drop policy if exists`:

```sql
create policy chats_owner_card on public.chats for update to authenticated
  using (status = 'active' and exists (select 1 from public.friends f
         where f.id = chats.friend_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from public.friends f
              where f.id = chats.friend_id and f.owner_id = auth.uid()));
```

plus `grant update (suitor_card), select (suitor_card) on public.chats to authenticated`. Column-level grants (on the existing revoke-all baseline) confine the wingman to this one column; the explicit `with check` is defense in depth against future grant widening; `status = 'active'` scoping means ended chats are immutable. Existing app reads are unaffected (the chats query names explicit columns — keep that convention; never `select *` on chats).

**Read path (friend only).** Restate `get_chat` in full (`create or replace`, `security definer set search_path = public stable`; execute grants survive replace). The payload includes `suitor_card` **only when the resolved role is `friend`** — the key must be entirely absent from the guest payload, not present-with-null (e.g. concatenate `jsonb_build_object('suitor_card', c.suitor_card)` onto the base object only inside a friend-role branch). Never returned-then-stripped client-side.

**Non-interactions verified by QA:** push trigger is AFTER INSERT only (card updates don't fire it); realtime broadcasts never include the card; messages remain revoke-all for authenticated (wingman still cannot read them); STOP enforcement untouched. A friend with the chat already open sees card edits only on reload — acceptable staleness.

## 2. iOS app — the "Who did they meet?" sheet

**Trigger.** In the chats tab, **Forward** opens a modal route `app/suitor-card.tsx` (expo-router modal, like the friend editor) for that chat instead of jumping straight to the share sheet. If the chat already has a card, the sheet opens pre-filled (fix a typo, add the photo taken later).

**Fields — all optional, in order:**

1. **Photo** — one image via the existing `ImagePicker` + `uploadPhoto()` flow (0.7 quality, same `photos` bucket, owner's uid folder).
2. **First name** — plain text.
3. **Instagram** — text field with a fixed `@` prefix rendered outside the value; stored without `@`. Client restricts input to the IG charset (server CHECK is the backstop).
4. **Vouch chips** — wrap row of preset tags toggled by tap, brand voice, final list at implementation (~8–10; working set: `funny · has a good job · your type · tall · great style · good texter · friend of a friend · certified normal`), plus an **"add your own"** field that becomes one more chip. Selected chips use the neon-lipstick accent.

**Buttons.** Primary **"Share the link"**: saves the card (single `update` of `suitor_card` on the chat row), then opens today's `Share.share(...)` message unchanged. Secondary **"Skip"**: straight to the share sheet, saving nothing. The share is the sacred path — a failed save never blocks it (toast the error, share anyway).

**Styling** follows After Dark tokens in `src/theme.ts`: plum-black sheet, outlined pill chips, accent for selected/primary. UI built under the impeccable skill.

## 3. Web — the friend's view

**Intro gate becomes the card** in `web/chat.html`, when `role === 'friend'` and `suitor_card` is present: suitor photo up top (full-bleed, glowing on plum-black), title **"Lia vouches for Dan"** (falls back to today's copy without a name), vouch chips as a pill row, IG handle as a tappable `@handle` link. Below: today's unchanged **Enter chat / Not interested** buttons and STOP reassurance. Missing fields simply don't render; no card = today's gate exactly.

**After entering,** a small "about Dan" affordance in the chat header reopens the card as an overlay. The guest side renders nothing new (its payload never contains the key).

**Rendering requirements (QA finding 5 — mandatory):**

- All text (name, tags, title) via `createElement`/`textContent` only. The page has zero `innerHTML` today; the card renderer must not introduce the first.
- Photo only via `img.src` assignment, with an `onerror` hide fallback for dangling URLs.
- IG link built by concatenating the fixed prefix `https://instagram.com/` + `encodeURIComponent(handle)`, only when the handle matches `^[A-Za-z0-9._]{1,30}$` client-side too; `target="_blank" rel="noopener noreferrer"`.
- Never assign `card.ig` or any card value directly to `href`.

## Error handling

- Save failure in the app: toast + proceed to share (never block forwarding).
- Constraint violation on write (malformed card): surfaces as a Supabase error → same toast path; the sheet keeps state so the wingman can retry.
- Broken photo URL on web: `onerror` hides the image; rest of card renders.
- `get_chat` consumers already tolerate absent keys; ended chats short-circuit before the gate renders.

## Testing

- **Backend suite additions** (`node --experimental-websocket backend/tests/...`, `@matchbook-test.com` emails): guest payload must NOT contain `suitor_card`; friend payload does; a wingman cannot update `suitor_card` on another wingman's chat; cannot update any other column; cannot update an ended chat's card; shape/ig/photo-prefix/size CHECKs reject bad payloads.
- **Web e2e extension:** gate renders with card (photo + name + chips + IG link) and without card (today's copy); guest view unchanged; "about" overlay after entering.
- **Manual checklist entry:** app sheet → skip path, fill path, re-open pre-filled path → share → friend gate round trip on device.

## Out of scope (deliberate)

- Guest-supplied self-info at "Say hi" time (the wingman is the author here).
- Storage garbage collection for orphaned photos — pre-existing pattern shared with friend photos; logged as a v2 follow-up.
- Realtime card updates for an already-open chat page.
