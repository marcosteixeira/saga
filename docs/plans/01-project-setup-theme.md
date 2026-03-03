# PR 01: Project Setup

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold the Next.js project with all core tooling and confirm it runs. No styling decisions, no theme, no custom pages.

**Architecture:** Next.js 14 App Router with TypeScript. Tailwind CSS and shadcn/ui installed and ready to use with defaults.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui

**Depends on:** Nothing (first PR)

---

### Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`

**Step 1: Scaffold Next.js with App Router**

Run: `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack`

Accept defaults. This creates the full project scaffold.

**Step 2: Verify it runs**

Run: `npm run dev`
Expected: App running at localhost:3000 with default Next.js page.

**Step 3: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold Next.js 14 project"
```

---

### Task 2: Install and Configure shadcn/ui

**Files:**
- Modify: `tailwind.config.ts`
- Create: `components.json`
- Create: `lib/utils.ts`

**Step 1: Initialize shadcn/ui**

Run: `npx shadcn@latest init`

Choose: New York style, Zinc base color, CSS variables = yes.

**Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: configure shadcn/ui"
```

---

## Testing Strategy

- Verify `npm run dev` starts without errors
- Verify `npm run build` succeeds
- Verify default Next.js page renders at localhost:3000

No unit tests needed — pure scaffolding.

---

## Acceptance Criteria

- [ ] Next.js 14 project scaffolded with TypeScript + Tailwind
- [ ] shadcn/ui initialized and configured
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` succeeds with no errors
