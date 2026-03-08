# Remove Action Suggestions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the preset suggested-action buttons from the desktop game action console while keeping manual action entry unchanged.

**Architecture:** Adjust the desktop action console component in the game client so it renders only the textarea and transmit button. Add a focused regression test that renders the console and asserts the preset labels are absent while the primary controls remain present.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, `react-dom/server`

---

### Task 1: Add regression coverage

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx`
- Create: `app/campaign/[slug]/game/components/__tests__/desktop-action-console.test.ts`

**Step 1: Write the failing test**

Render the desktop action console to static markup and assert:
- the textarea placeholder is present
- the `Transmit` button label is present
- preset labels like `Look around` and `Attack` are absent

**Step 2: Run test to verify it fails**

Run: `yarn test 'app/campaign/[slug]/game/components/__tests__/desktop-action-console.test.ts'`

Expected: FAIL because the preset labels are still rendered.

**Step 3: Write minimal implementation**

Remove the preset-action button group from the desktop action console and export the component for direct test coverage.

**Step 4: Run test to verify it passes**

Run: `yarn test 'app/campaign/[slug]/game/components/__tests__/desktop-action-console.test.ts'`

Expected: PASS with the primary controls still rendered.

### Task 2: Verify no local regression in touched UI code

**Files:**
- Test: `app/campaign/[slug]/game/components/__tests__/desktop-action-console.test.ts`

**Step 1: Run targeted verification**

Run: `yarn test 'app/campaign/[slug]/game/components/__tests__/desktop-action-console.test.ts'`

Expected: PASS
