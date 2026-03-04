import type { World } from '@/types'

const GENERIC_FETCH_ERROR = 'Failed to load worlds from vault.'

type WorldsResponse = {
  worlds?: World[]
  error?: string
}

export type SelectableWorldsResult = {
  ok: boolean
  worlds: World[]
  totalWorldCount: number
  error: string | null
}

function parseErrorMessage(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  ) {
    return (data as { error: string }).error
  }

  return GENERIC_FETCH_ERROR
}

export async function fetchSelectableWorlds(
  fetcher: (input: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }> = fetch
): Promise<SelectableWorldsResult> {
  try {
    const res = await fetcher('/api/world')
    const data = (await res.json().catch(() => null)) as WorldsResponse | null

    if (!res.ok) {
      return { ok: false, worlds: [], totalWorldCount: 0, error: parseErrorMessage(data) }
    }

    const allWorlds = Array.isArray(data?.worlds) ? data.worlds : []
    const selectableWorlds = allWorlds.filter(world => world.status === 'ready')

    return {
      ok: true,
      worlds: selectableWorlds,
      totalWorldCount: allWorlds.length,
      error: null,
    }
  } catch {
    return { ok: false, worlds: [], totalWorldCount: 0, error: GENERIC_FETCH_ERROR }
  }
}
