# Party Deck Photo Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap-to-advance photo carousel on the party-deck hero so all of a friend's photos are viewable at the party.

**Architecture:** Extract the deck card into a `DeckCard` component (per-card `photoIndex` state), then layer two invisible tap-zone `Pressable`s and a segment-bar indicator over the existing hero. Spec: `docs/superpowers/specs/2026-07-08-deck-photo-carousel-design.md`.

**Tech Stack:** React Native / Expo SDK 57, expo-router, existing theme tokens only.

## Global Constraints

- No new dependencies, no new files — everything in `app/app/deck.tsx`.
- Champagne (`colors.champagne`) is garnish only: active bar, never backgrounds.
- Profiles with ≤ 1 photo must render pixel-identical to today (no bars, no tap zones).
- Verification for every task: `cd app && npx tsc --noEmit && npm run lint` — both clean.
- The app has no test suite; each task's checks are the type/lint gate plus the manual checklist in the spec.

---

### Task 1: Extract `DeckCard` (pure refactor)

**Files:**
- Modify: `app/app/deck.tsx`

**Interfaces:**
- Produces: `function DeckCard({ friend }: { friend: Friend })` rendered by the FlatList as `renderItem={({ item }) => <DeckCard friend={item} />}`. `share` moves to module scope.

- [ ] **Step 1: Move `share` to module scope and extract the card**

In `app/app/deck.tsx`, move `share` above `Deck()`:

```tsx
const share = (f: Friend) =>
  Share.share({ message: `Meet ${f.first_name} 🔥 ${WEB_BASE_URL}/p/${f.share_slug}` });
```

Add a `DeckCard` component (below `Deck()`), moving the entire JSX from `renderItem` into it with `item` renamed to `friend`:

```tsx
function DeckCard({ friend }: { friend: Friend }) {
  return (
    <View style={s.card}>
      {/* Full-bleed hero: photo edge-to-edge, name overlaid on a scrim (matches web /p/) */}
      <View style={s.hero}>
        {friend.photos[0]
          ? <Image source={{ uri: friend.photos[0] }} style={s.photo} />
          : <View style={[s.photo, s.noPhoto]}><Text style={{ fontSize: 60 }}>💘</Text></View>}
        <LinearGradient
          colors={['transparent', 'rgba(16,10,19,0.55)', colors.night]}
          locations={[0, 0.55, 1]}
          style={s.scrim}
        />
        <View style={s.id}>
          <Text style={s.name}>
            {friend.first_name}
            {friend.age ? <Text style={s.age}>  {friend.age}</Text> : null}
          </Text>
          {!!(friend.city || friend.job) && (
            <Text style={s.city}>{[friend.city, friend.job].filter(Boolean).join(' · ')}</Text>
          )}
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {!!friend.pitch && (
          <View style={s.pitchWrap}>
            <Text style={s.quoteMark}>“</Text>
            <Text style={s.pitch}>{friend.pitch}</Text>
          </View>
        )}
        {(friend.prompts ?? []).slice(0, 2).map((p) => (
          <View key={p.q} style={s.prompt}>
            <Text style={s.q}>{p.q.toUpperCase()}</Text><Text style={s.a}>{p.a}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={s.footer}>
        <Pressable style={({ pressed }) => [s.share, pressed && s.sharePressed]} onPress={() => share(friend)}>
          <Text style={s.shareText}>Share {friend.first_name}’s profile</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

Replace the FlatList's `renderItem` with:

```tsx
renderItem={({ item }) => <DeckCard friend={item} />}
```

- [ ] **Step 2: Verify types and lint**

Run: `cd app && npx tsc --noEmit && npm run lint`
Expected: both exit clean.

- [ ] **Step 3: Commit**

```bash
git add app/app/deck.tsx
git commit -m "refactor: extract DeckCard so each card can hold its own state"
```

---

### Task 2: Tap-to-advance carousel with segment bars

**Files:**
- Modify: `app/app/deck.tsx` (DeckCard hero + styles)

**Interfaces:**
- Consumes: `DeckCard` from Task 1.

- [ ] **Step 1: Add photoIndex state and carousel controls to the hero**

At the top of `DeckCard`, add:

```tsx
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = friend.photos ?? [];
  const step = (d: number) => setPhotoIndex((i) => (i + d + photos.length) % photos.length);
```

Replace the hero block with (photo now indexed; controls only when 2+ photos; the id
overlay gains `pointerEvents="none"` and moves after the controls so it never swallows taps):

```tsx
      <View style={s.hero}>
        {photos[photoIndex]
          ? <Image source={{ uri: photos[photoIndex] }} style={s.photo} />
          : <View style={[s.photo, s.noPhoto]}><Text style={{ fontSize: 60 }}>💘</Text></View>}
        <LinearGradient
          colors={['transparent', 'rgba(16,10,19,0.55)', colors.night]}
          locations={[0, 0.55, 1]}
          style={s.scrim}
        />
        {photos.length > 1 && (
          <>
            <Pressable style={[s.tapZone, { left: 0 }]} onPress={() => step(-1)} />
            <Pressable style={[s.tapZone, { right: 0 }]} onPress={() => step(1)} />
            <View style={s.segs}>
              {photos.map((url, i) => (
                <View key={url} style={[s.seg, i === photoIndex && s.segOn]} />
              ))}
            </View>
          </>
        )}
        <View style={s.id} pointerEvents="none">
          <Text style={s.name}>
            {friend.first_name}
            {friend.age ? <Text style={s.age}>  {friend.age}</Text> : null}
          </Text>
          {!!(friend.city || friend.job) && (
            <Text style={s.city}>{[friend.city, friend.job].filter(Boolean).join(' · ')}</Text>
          )}
        </View>
      </View>
```

Update the react import: `import { useEffect, useState } from 'react';` already present — no change.

Add styles to the StyleSheet:

```tsx
  tapZone: { position: 'absolute', top: 0, bottom: 0, width: '50%' },
  segs: { position: 'absolute', top: 60, left: 16, right: 74, flexDirection: 'row', gap: 5 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(244,237,246,0.28)' },
  segOn: { backgroundColor: colors.champagne },
```

(`right: 74` keeps the bars clear of the 44px close button at `right: 22`; `top: 60`
clears the status bar like the close button's `top: 58`.)

- [ ] **Step 2: Verify types and lint**

Run: `cd app && npx tsc --noEmit && npm run lint`
Expected: both exit clean.

- [ ] **Step 3: Add the carousel to the manual test checklist**

Append to `docs/superpowers/manual-test-checklist.md` under party mode (or a new
section if none): the 4 checks from the spec's Testing section.

- [ ] **Step 4: Commit**

```bash
git add app/app/deck.tsx docs/superpowers/manual-test-checklist.md
git commit -m "feat: tap-to-advance photo carousel on the party deck hero"
```

---

### Task 3: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Walk the spec's manual checklist on device**

`cd app && npx expo start`, then verify checks 1–4 from the spec's Testing section.
All pass → done; anything fails → fix before claiming completion
(superpowers:verification-before-completion).
