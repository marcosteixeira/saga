export type WorldStatus = 'generating' | 'ready' | 'error';

export type WorldClass = {
  name: string;
  description: string;
};

export type World = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  world_content: string | null;
  cover_image_url: string | null;
  map_image_url: string | null;
  status: WorldStatus;
  classes: WorldClass[];
  created_at: string;
};

export type WorldInsert = Pick<World, 'user_id' | 'name' | 'description'>;
