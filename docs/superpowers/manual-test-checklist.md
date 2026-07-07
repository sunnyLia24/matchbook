# Matchbook — manual regression checklist

Run this against the live stack (`https://matchbook-party.netlify.app` + Supabase project
`gyhqbnyuufntgdmowrbi`) before shipping any change that touches `backend/migrations/`,
`web/profile.html`, or `web/chat.html`. Steps 1–6 are automatable end-to-end with
`node --experimental-websocket backend/tests/e2e-live.mjs` (seed, RPCs, and the realtime
wire itself); the rest require a real browser because they exercise rendering, the native
`confirm()` dialogs, and cross-tab visual behavior.

Seed fresh data for a manual pass with:
```
node --experimental-websocket backend/tests/seed-demo.mjs
```
(prints a `/p/<slug>` link; sign in as that owner via a throwaway script if you need the
friend-side token — see the pattern in `backend/tests/e2e-live.mjs` steps 1–3.)

## 1. Profile page renders
Open `/p/<share_slug>` for a `single`+`consented` friend with photos, a pitch, at least one
prompt, and a `looking_for` line.
**Expected:** name + age, city, pitch (with the decorative quote + "— their wingperson"
line), all prompts, the looking-for line, and a "Say hi 👋" button all render. Zero
console errors (ignore browser-extension noise unrelated to the page). Brand color is
lipstick red/pink (`oklch(0.58 0.22 355)` family, hex ~`#BE1E5E`) — never terracotta/orange
and never cream backgrounds.

## 2. Missing/unavailable profile
Open `/p/<bad-slug>` or a slug for a friend with `status != 'single'` or `consented = false`.
**Expected:** friendly "This link isn't active." state, no stack traces, no leaked fields.

## 3. Say hi → guest chat
From a live profile, tap **Say hi 👋**.
**Expected:** navigates to `/c/<guest_token>`; header reads "Chat with `<first_name>`";
composer + STOP hint visible; no intro gate (guests never see it).

## 4. Send a message (guest side)
Type a message and tap **Send** (or press Return — see known issue below).
**Expected:** message appears right-aligned in the brand-red bubble.
**Known issue:** the sender's own message can render twice in their own tab (see "Known
defects" below) — this is a client-side display bug only; confirm via
`get_chat`/`send_message` RPC or the other party's tab that only one message was actually
stored.

## 5. Friend-side intro gate
Open the same chat's `/c/<friend_token>` link (get it from `chats.friend_token` as the
owner) in a second tab/browser, before the friend has sent anything.
**Expected:** full-screen drenched lipstick-red gate: "💌 `<wingperson display_name>`
vouches for this", body copy about no accounts/STOP, a white **Enter chat** button and a
**Not interested** ghost link. Tapping **Enter chat** dismisses the gate and shows the
room with the guest's prior messages already loaded.

## 6. Two-way realtime (no reload)
With guest tab and (post-gate) friend tab both open, send a message from each side in
turn.
**Expected:** each message appears on the *other* tab within ~1–2 seconds without a
manual reload (Realtime broadcast on `chat:<broadcast_key>`, events `message`/`ended`).

## 7. STOP ends the chat for both sides
From either tab, send a message that normalizes to STOP (`STOP`, `stop`, `  Stop  `, etc.
— all whitespace trimmed, case-insensitive).
**Expected:** the sender's tab immediately shows "This chat has ended."; the other open
tab shows the same within ~1–2 seconds with no reload. The literal STOP text is never
rendered as a chat bubble on either side.

## 8. Ended chat is permanent
Reload either `/c/<token>` link after STOP (or after "Not interested" / "End chat").
**Expected:** "This chat has ended." immediately, composer/hint/End-chat button all
hidden; no intro gate even for an unentered friend link. Calling `send_message` against
either token returns `{ok:false, error:'ended'}` and stores nothing new.

## 9. Friend declines ("Not interested")
On a fresh, un-entered chat, open the friend link and tap **Not interested**, then confirm
the native dialog.
**Expected:** chat ends for both sides (guest tab flips to ended live via broadcast;
reloading the friend tab shows ended, skipping the gate). `end_chat` is idempotent —
calling it again is a no-op.

## 10. Owner sees only chat metadata
As the signed-in wingperson, select explicit columns
(`id, friend_id, status, ended_by, friend_token, created_at, ended_at`) from `chats` —
never `*`. **Expected:** the row is visible, `guest_token` is NOT selectable (RLS/grant
error), and `messages` is completely unreadable to the owner (no rows, or a permission
error) — wingpeople can never read chat content.

## 11. Status-flip kill switch
As the owner, change a friend's `status` away from `single` (e.g. to `taken`) while they
have an active chat.
**Expected:** `get_profile` for that friend's slug returns null (profile page shows "This
link isn't active."); any of that friend's active chats flip to `status: 'ended'`
automatically (DB trigger) — both participant tokens show the ended state.

## 12. Regression: hidden/taken profile never creates a chat
Attempt `create_chat` (or tap Say hi, if somehow rendered) against a slug whose friend is
`hidden`, `taken`, or not consented.
**Expected:** RPC returns null; no chat row is created.

---

## Known defects observed (not fixed as part of this checklist — tracked separately)

- **Sender-side message duplication (web/chat.html):** when a participant sends a message,
  it can render twice in their own chat log (confirmed via server-side `get_chat` that only
  one row is actually stored — this is cosmetic, not a data-integrity bug). Root cause is
  believed to be the local optimistic `addMsg()` call combined with the Realtime broadcast
  channel echoing the sender's own message back to itself (Supabase broadcast delivers to
  the sender unless the channel is configured with `self: false` or the local echo is
  removed). Reproduced consistently on the friend side; reproduced once via Enter-key submit
  on the guest side. The other participant's view of that same message is never duplicated.
- **"Not interested" confirm-dialog untestable via headless browser automation:** the
  native `window.confirm()` guarding the decline action cannot be programmatically accepted
  by DOM-based browser automation (Chrome MCP tools) — automation sees no visible state
  change because the dialog is auto-dismissed as Cancel. This is a testing-tool limitation,
  not a product defect; verified the same code path by calling `end_chat` directly (the
  same RPC the confirmed handler calls) and confirmed both tabs update correctly. A real
  user tapping through the native dialog is unaffected.

## Sign in with Apple (TestFlight build required — does not work in Expo Go/simulator)

- [ ] Apple button (black, native) shows above the email form with an "or" divider
- [ ] Fresh Apple sign-up: Face ID sheet → lands on roster with no name-prompt card; a friend chat invite shows your Apple name in "<name> vouches for this"
- [ ] Cancel the Apple sheet: no error alert, stay on sign-in screen
- [ ] Apple sign-in with the same email as an existing email/password account: signs into the existing account (no duplicate), display name unchanged
- [ ] Missing-name safety net: account with empty display_name sees "What's your name?" card on roster; saving hides it and the name appears on chat invites
