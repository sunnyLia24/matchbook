-- Private organizing field for the wingperson. Deliberately NOT added to
-- get_profile(): matches never see it.
alter table public.friends
  add column if not exists gender text
  check (gender in ('guy', 'girl', 'nonbinary'));
