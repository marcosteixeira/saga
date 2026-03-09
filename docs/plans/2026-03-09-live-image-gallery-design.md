# Design: Live Image Gallery During Loading & Gameplay

**Date:** 2026-03-09

## Problem

The `image:ready` Realtime subscription lives inside `ActiveGameView`, which is not mounted during the `loading` state (new game flow). Any `image:ready` broadcast that fires while the loading screen is showing is silently dropped. When the game transitions to `active`, the gallery is empty even though the images finished generating.

A second gap: the world map URL in the gallery is static (from server-side props) and never live-updates during gameplay.

## Solution

Lift the image Realtime subscription and live URL state up to `GameClient` so it is active from page mount through both loading and active states.

## State Changes

Two state vars move from `ActiveGameView` to `GameClient`:

| State | Init value | Updated by |
|-------|-----------|-----------|
| `liveCoverUrl` | `campaignCoverImageUrl` prop | `image:ready` where `entity_type=campaign` OR `entity_type=world, image_type=cover` |
| `liveMapUrl` | `world.map_url` prop | `image:ready` where `entity_type=world, image_type=map` |

## Component Changes

**`GameClient`**
- Add `liveCoverUrl` and `liveMapUrl` state
- Move `image:ready` subscription here from `ActiveGameView`
- Pass `liveCoverUrl ?? liveMapUrl` to `LoadingState` as `backgroundImageUrl` (replaces static `loadingImageUrl` prop)
- Pass `liveCoverUrl` and `liveMapUrl` as props to `ActiveGameView`
- Remove `loadingImageUrl` prop (no longer needed)

**`ActiveGameView`**
- Remove `liveCoverUrl` state and `image:ready` subscription
- Accept `liveCoverUrl` and `liveMapUrl` as props
- Gallery uses `liveMapUrl` instead of static `world.map_url`

**`LoadingState`**
- No changes needed; already handles `backgroundImageUrl` being initially null and filling in later

## What Does NOT Change

- `generate-image` edge function — no changes
- Database schema — no changes
- Broadcast payload format — no changes
- `world.cover_url` in gallery — still static (world cover is generated before anyone joins)

## Scope

~35 lines moved, two new props on `ActiveGameView`, one prop swap on `LoadingState`.
