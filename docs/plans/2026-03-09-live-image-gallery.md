# Live Image Gallery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the game screen react to `image:ready` broadcasts from the moment the page mounts so the campaign cover and world map appear in the gallery even if generation finishes during the loading screen.

**Architecture:** Lift `liveCoverUrl`, `liveMapUrl` state and the `image:ready` Realtime subscription from `ActiveGameView` up to the outer `GameClient` component, which is always mounted. Pass the live URLs down as props to both `LoadingState` (for the background) and `ActiveGameView` (for the gallery). Remove the static `loadingImageUrl` prop; derive it from live state instead.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase Realtime broadcast, TypeScript strict mode.

---

### Task 1: Add live image state and subscription to `GameClient`

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx`

**Context:** `GameClient` starts at line 2078. Its props interface is at lines 20–28. The `LoadingState` render is at lines 2339–2342. The `ActiveGameView` render is at lines 2345–2361.

---

**Step 1: Remove `loadingImageUrl` from `GameClientProps`**

In `GameClientProps` (lines 20–28), remove the `loadingImageUrl?: string` line. The loading background will be derived from live state instead.

Before:
```tsx
interface GameClientProps {
  campaign: Campaign;
  world: World;
  players: Player[];
  messages: Message[];
  currentUserId: string;
  loadingImageUrl?: string;
  campaignCoverImageUrl?: string;
}
```

After:
```tsx
interface GameClientProps {
  campaign: Campaign;
  world: World;
  players: Player[];
  messages: Message[];
  currentUserId: string;
  campaignCoverImageUrl?: string;
}
```

---

**Step 2: Remove `loadingImageUrl` from the destructure in `GameClient`**

At line 2078–2086, remove `loadingImageUrl` from the destructure:

Before:
```tsx
export default function GameClient({
  campaign,
  world,
  players: dbPlayers,
  messages: dbMessages,
  currentUserId,
  loadingImageUrl,
  campaignCoverImageUrl
}: GameClientProps) {
```

After:
```tsx
export default function GameClient({
  campaign,
  world,
  players: dbPlayers,
  messages: dbMessages,
  currentUserId,
  campaignCoverImageUrl
}: GameClientProps) {
```

---

**Step 3: Add `liveCoverUrl` and `liveMapUrl` state in `GameClient`**

Add these two lines immediately after the `liveMessages` state (around line 2097, after the `setLiveMessages` useState call):

```tsx
const [liveCoverUrl, setLiveCoverUrl] = useState<string | undefined>(campaignCoverImageUrl);
const [liveMapUrl, setLiveMapUrl] = useState<string | null | undefined>(world.map_url);
```

---

**Step 4: Add the `image:ready` Realtime subscription in `GameClient`**

Add this `useEffect` immediately after the state declarations from Step 3. Place it before the existing WebSocket `useEffect` (which starts with `// WebSocket connection with exponential-backoff reconnection`):

```tsx
// Subscribe to image generation updates — runs from page mount so events
// during the loading state are not missed.
useEffect(() => {
  const supabase = createClient();
  const imageChannel = supabase
    .channel(`world:${world.id}`)
    .on(
      'broadcast',
      { event: 'image:ready' },
      (message: {
        payload: {
          entity_type: string;
          entity_id: string;
          image_type: string;
          url: string;
          image_id: string;
        };
      }) => {
        const { entity_type, entity_id, image_type, url } = message.payload;
        if (entity_type === 'campaign' && entity_id === campaign.id) {
          setLiveCoverUrl(url);
        } else if (entity_type === 'world' && entity_id === world.id && image_type === 'cover') {
          setLiveCoverUrl(url);
        } else if (entity_type === 'world' && entity_id === world.id && image_type === 'map') {
          setLiveMapUrl(url);
        }
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(imageChannel);
  };
}, [campaign.id, world.id]);
```

---

**Step 5: Update the `LoadingState` render to use live state**

At line 2341, change the static `loadingImageUrl` prop to the live equivalent:

Before:
```tsx
<LoadingState campaignName={campaign.name} backgroundImageUrl={loadingImageUrl} />
```

After:
```tsx
<LoadingState campaignName={campaign.name} backgroundImageUrl={liveCoverUrl ?? liveMapUrl ?? undefined} />
```

---

**Step 6: Update the `ActiveGameView` render to pass live URLs**

At lines 2345–2361, replace the `campaignCoverImageUrl` prop with `liveCoverUrl` and `liveMapUrl`:

Before:
```tsx
return (
  <ActiveGameView
    campaign={campaign}
    world={world}
    players={dbPlayers}
    liveMessages={liveMessages}
    optimisticMessages={optimisticMessages}
    lastActionSentAt={lastActionSentAt}
    streamingContent={streamingContent}
    isStreaming={isStreaming}
    currentUserId={currentUserId}
    campaignCoverImageUrl={campaignCoverImageUrl}
    wsStatus={wsStatus}
    isSilentReconnect={isSilentReconnect}
    onSend={handleSend}
  />
);
```

After:
```tsx
return (
  <ActiveGameView
    campaign={campaign}
    world={world}
    players={dbPlayers}
    liveMessages={liveMessages}
    optimisticMessages={optimisticMessages}
    lastActionSentAt={lastActionSentAt}
    streamingContent={streamingContent}
    isStreaming={isStreaming}
    currentUserId={currentUserId}
    liveCoverUrl={liveCoverUrl}
    liveMapUrl={liveMapUrl}
    wsStatus={wsStatus}
    isSilentReconnect={isSilentReconnect}
    onSend={handleSend}
  />
);
```

---

### Task 2: Update `ActiveGameView` to receive live URLs as props

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx` (lines 1591–1664)

**Context:** `ActiveGameView` is at line 1589. Its props destructure starts at 1591. The local `liveCoverUrl` state is at lines 1625–1627. The `image:ready` subscription is at lines 1629–1664.

---

**Step 1: Update the `ActiveGameView` props interface**

At lines 1605–1618, replace `campaignCoverImageUrl?: string` with `liveCoverUrl` and `liveMapUrl`:

Before:
```tsx
  campaign: Campaign;
  world: World;
  players: Player[];
  liveMessages: Message[];
  optimisticMessages: OptimisticMessage[];
  lastActionSentAt: number | null;
  streamingContent: string;
  isStreaming: boolean;
  currentUserId: string;
  campaignCoverImageUrl?: string;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  isSilentReconnect: boolean;
  onSend: (content: string) => void;
```

After:
```tsx
  campaign: Campaign;
  world: World;
  players: Player[];
  liveMessages: Message[];
  optimisticMessages: OptimisticMessage[];
  lastActionSentAt: number | null;
  streamingContent: string;
  isStreaming: boolean;
  currentUserId: string;
  liveCoverUrl?: string;
  liveMapUrl?: string | null;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  isSilentReconnect: boolean;
  onSend: (content: string) => void;
```

---

**Step 2: Update the `ActiveGameView` props destructure**

At lines 1591–1604, replace `campaignCoverImageUrl: initialCampaignCoverImageUrl` with `liveCoverUrl` and `liveMapUrl`:

Before:
```tsx
function ActiveGameView({
  campaign,
  world,
  players,
  liveMessages,
  optimisticMessages,
  lastActionSentAt,
  streamingContent,
  isStreaming,
  currentUserId,
  campaignCoverImageUrl: initialCampaignCoverImageUrl,
  wsStatus,
  isSilentReconnect,
  onSend,
```

After:
```tsx
function ActiveGameView({
  campaign,
  world,
  players,
  liveMessages,
  optimisticMessages,
  lastActionSentAt,
  streamingContent,
  isStreaming,
  currentUserId,
  liveCoverUrl,
  liveMapUrl,
  wsStatus,
  isSilentReconnect,
  onSend,
```

---

**Step 3: Remove local `liveCoverUrl` state**

Delete lines 1625–1627 (the `useState` for `liveCoverUrl`):

```tsx
// DELETE these lines:
const [liveCoverUrl, setLiveCoverUrl] = useState<string | undefined>(
  initialCampaignCoverImageUrl
);
```

---

**Step 4: Remove the `image:ready` subscription from `ActiveGameView`**

Delete lines 1629–1664 (the entire `// Subscribe to image updates` `useEffect` block including the comment):

```tsx
// DELETE everything from:
// Subscribe to image updates
useEffect(() => {
  ...
}, [campaign.id, world.id]);
```

---

**Step 5: Run TypeScript check**

```bash
cd /Users/marcosteixeira/Dev/saga && yarn tsc --noEmit
```

Expected: no errors. If `setLiveCoverUrl` or `setLiveMapUrl` are flagged as unused in `ActiveGameView`, that confirms the removal was correct.

---

**Step 6: Commit**

```bash
git add app/campaign/[slug]/game/GameClient.tsx
git commit -m "feat: lift image subscription to GameClient so cover appears during loading"
```

---

### Task 3: Update `DesktopRightSidebar` gallery to use live map URL

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx` (lines 1356–1375 and ~1888)

**Context:** `DesktopRightSidebar` is a local component that renders the right sidebar including the gallery. It currently receives `coverImageUrl` but reads `world.map_url` directly from the `world` prop (static). We need to add a `mapUrl` prop so the gallery live-updates when the world map finishes generating.

---

**Step 1: Add `mapUrl` prop to `DesktopRightSidebar`**

At lines 1356–1362, update the props:

Before:
```tsx
  world,
  onImageClick,
  coverImageUrl
}: {
  world: World;
  onImageClick: (state: ImageModalState) => void;
  coverImageUrl: string | null;
```

After:
```tsx
  world,
  onImageClick,
  coverImageUrl,
  mapUrl,
}: {
  world: World;
  onImageClick: (state: ImageModalState) => void;
  coverImageUrl: string | null;
  mapUrl?: string | null;
```

---

**Step 2: Replace `world.map_url` with `mapUrl` in `DesktopRightSidebar` gallery**

At line 1367, in the `galleryImages` array:

Before:
```tsx
    world.map_url ? { url: world.map_url, caption: `${world.name} — Map` } : null,
```

After:
```tsx
    mapUrl ? { url: mapUrl, caption: `${world.name} — Map` } : null,
```

---

**Step 3: Pass `liveMapUrl` when calling `DesktopRightSidebar`**

Find the `<DesktopRightSidebar` call in `ActiveGameView` (around line 1888):

Before:
```tsx
        world={world}
        onImageClick={handleImageClick}
        coverImageUrl={liveCoverUrl ?? null}
```

After:
```tsx
        world={world}
        onImageClick={handleImageClick}
        coverImageUrl={liveCoverUrl ?? null}
        mapUrl={liveMapUrl ?? null}
```

---

**Step 4: Replace `world.map_url` with `liveMapUrl` in mobile gallery**

At lines 2039, in the `mobileGallery` array inside `ActiveGameView`:

Before:
```tsx
            world.map_url ? { url: world.map_url, caption: `${world.name} — Map` } : null,
```

After:
```tsx
            liveMapUrl ? { url: liveMapUrl, caption: `${world.name} — Map` } : null,
```

---

**Step 5: Run TypeScript check and lint**

```bash
cd /Users/marcosteixeira/Dev/saga && yarn tsc --noEmit && yarn lint
```

Expected: no errors or warnings introduced.

---

**Step 6: Remove `loadingImageUrl` from page.tsx**

The server component at `app/campaign/[slug]/game/page.tsx` still passes `loadingImageUrl` to `GameClient`. Find that prop and remove it — the prop no longer exists on `GameClientProps`.

Search for the prop call:
```bash
grep -n "loadingImageUrl" app/campaign/[slug]/game/page.tsx
```

Remove the `loadingImageUrl={loadingImageUrl}` line from the `<GameClient>` JSX and the `loadingImageUrl` variable declaration if it's only used there.

---

**Step 7: Final TypeScript check**

```bash
cd /Users/marcosteixeira/Dev/saga && yarn tsc --noEmit
```

Expected: zero errors.

---

**Step 8: Commit**

```bash
git add app/campaign/[slug]/game/GameClient.tsx app/campaign/[slug]/game/page.tsx
git commit -m "feat: live map url in gallery, remove static loadingImageUrl prop"
```

---

## Manual Verification

1. Open a campaign that has no cover image yet (or use a slow network to simulate delay)
2. Join the game — the loading screen appears
3. In Supabase dashboard or via a test script, manually broadcast an `image:ready` event on channel `world:{worldId}` with `entity_type=campaign`, `entity_id={campaignId}`, `image_type=cover`, `url=<any image url>`
4. Verify: the loading screen background fills in without a page reload
5. Once the game transitions to active, verify the cover appears in the gallery
6. Repeat step 3 with `image_type=map` — verify the map slot appears in both desktop sidebar and mobile gallery
