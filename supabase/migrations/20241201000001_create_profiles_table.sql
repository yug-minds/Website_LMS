-- Create profiles table linked to auth.users
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  email text,
  role text check (role in ('admin', 'school_admin', 'teacher', 'student')) default 'student',
  school_id uuid,
  force_password_change boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table profiles enable row level security;

-- Create policies
create policy "Public read" on profiles
  for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Create function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, 'student');
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger for new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
