type SessionRow = {
  opening_situation: string | null;
};

type SessionQueryResult = {
  data: SessionRow | null;
  error: unknown;
};

type SessionQueryBuilder = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: number) => {
        maybeSingle: () => Promise<SessionQueryResult>;
      };
    };
  };
};

type SessionReadyClient = {
  from: (table: 'sessions') => SessionQueryBuilder;
};

export async function fetchSessionOpeningReady(
  client: SessionReadyClient,
  campaignId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('sessions')
    .select('opening_situation')
    .eq('campaign_id', campaignId)
    .eq('session_number', 1)
    .maybeSingle();

  if (error) return false;

  return Boolean(data?.opening_situation);
}
