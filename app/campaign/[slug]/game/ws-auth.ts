export interface GameSessionSocketConfig {
  url: string;
  protocols: string[];
}

export function buildGameSessionSocketConfig({
  supabaseUrl,
  campaignId,
  accessToken
}: {
  supabaseUrl: string;
  campaignId: string;
  accessToken: string;
}): GameSessionSocketConfig {
  const wsBase = supabaseUrl.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return {
    url: `${wsBase}/functions/v1/game-session?campaignId=${encodeURIComponent(campaignId)}`,
    protocols: [`jwt-${accessToken}`]
  };
}
