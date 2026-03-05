type SessionQueryResult = {
  data: { opening_situation: string | null } | null;
  error: unknown;
};

export async function fetchSessionOpeningReady(
  fetchSession: () => PromiseLike<SessionQueryResult>
): Promise<boolean> {
  const { data, error } = await fetchSession();

  if (error) return false;

  return Boolean(data?.opening_situation);
}
