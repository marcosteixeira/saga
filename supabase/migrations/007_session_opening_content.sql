alter table sessions
  add column if not exists opening_situation text,
  add column if not exists starting_hooks    jsonb,
  add column if not exists scene_image_url   text;
