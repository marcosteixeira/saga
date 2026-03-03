# Saga — PR Breakdown (Master Plan)

> **Reference:** See `DESIGN.md` for full architecture, schema, and decisions.

## PR Dependency Graph

```
PR 01: Project Setup + Dark Fantasy Theme
  └─► PR 02: Landing Page
        └─► PR 03: Database + Types + Supabase Clients
              └─► PR 04: Campaign Creation (Form + DB Insert)
                    └─► PR 05: AI World Generation (Claude + Memory Files)
                    │     └─► PR 06: Image Generation (Gemini — Cover + Map)
                    └─► PR 07: Lobby — Player Joining + Character Creation
                          └─► PR 08: Lobby Realtime + Character Portraits
                                └─► PR 09: Game Room Layout + Static UI
                                      └─► PR 10: AI Narration + Streaming
                                      │     └─► PR 11: Memory System (MEMORY_UPDATE Parsing)
                                      └─► PR 12: Player Actions + Free Mode Game Loop
                                            └─► PR 13: Session Management + Summary
                                            └─► PR 14: Combat Mode (Sequential Turns)
                                                  └─► PR 15: Polish + Vercel Deploy
```

## PR Summary Table

| PR | Name | Key Deliverable | Est. Size |
|----|------|----------------|-----------|
| 01 | Project Setup + Dark Fantasy Theme | Scaffolded app with theme system | S |
| 02 | Landing Page | Hero, CTAs, join input, placeholder routes | S |
| 03 | Database + Types + Supabase | Schema, clients, TypeScript types | S |
| 04 | Campaign Creation Form | Form → DB insert → redirect to lobby | S |
| 05 | AI World Generation | Claude generates WORLD.md during creation | M |
| 06 | Image Generation | Gemini generates cover + map images | M |
| 07 | Lobby + Player Joining | Character creation, join flow, session tokens | M |
| 08 | Lobby Realtime + Portraits | Live player list, Gemini portraits, host controls | M |
| 09 | Game Room Static UI | Full game room layout, renders messages from DB | M |
| 10 | AI Narration Streaming | Claude streaming → Supabase broadcast → live UI | L |
| 11 | Memory System | Parse MEMORY_UPDATE, update campaign files + stats | M |
| 12 | Player Actions + Free Mode | Action submission, turn collection, timer, auto-narrate | L |
| 13 | Session Management | Start/end session, Claude summary, status transitions | M |
| 14 | Combat Sequential Mode | Turn order, active player, sequential input control | M |
| 15 | Polish + Deploy | Error handling, edge cases, Vercel deployment | S |

## Principles

- **Each PR is independently reviewable and deployable** (no broken states)
- **TDD where practical** — test API routes, lib functions, and key logic
- **Incremental value** — each PR adds visible progress
- **No premature abstraction** — build what's needed for the current PR only
