-- Extend chapter_contents table to support richer chapter content types
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'chapter_contents' and column_name = 'storage_path'
  ) then
    alter table chapter_contents
      add column storage_path text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'chapter_contents' and column_name = 'content_metadata'
  ) then
    alter table chapter_contents
      add column content_metadata jsonb default '{}'::jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'chapter_contents' and column_name = 'thumbnail_url'
  ) then
    alter table chapter_contents
      add column thumbnail_url text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'chapter_contents' and column_name = 'content_label'
  ) then
    alter table chapter_contents
      add column content_label text;
  end if;
end $$;

-- Broaden allowed content types
alter table chapter_contents
  drop constraint if exists chapter_contents_content_type_check;

alter table chapter_contents
  add constraint chapter_contents_content_type_check
  check (
    content_type in (
      'text',
      'video',
      'video_link',
      'pdf',
      'image',
      'file',
      'audio',
      'html',
      'link',
      'quiz',
      'assignment'
    )
  );

-- Helpful index for ordering content per chapter
create index if not exists idx_chapter_contents_chapter_id_order
  on chapter_contents(chapter_id, order_index);

