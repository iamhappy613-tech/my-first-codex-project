-- Wordspace: apply once using Supabase migrations / SQL editor as project owner.
begin;
create schema if not exists private;
revoke all on schema private from public;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, role text not null default 'user' check(role in ('user','admin')),
 enabled boolean not null default true, created_at timestamptz not null default now()
);
create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,email) values(new.id,coalesce(new.email,''));return new;end $$;
create trigger wordspace_new_user after insert on auth.users for each row execute function private.new_profile();
insert into public.profiles(id,email) select id,coalesce(email,'') from auth.users on conflict do nothing;
create function private.active(who uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=who and enabled)$$;
create function private.admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and enabled and role='admin')$$;
grant usage on schema private to authenticated;
grant execute on function private.active(uuid),private.admin() to authenticated;
create table public.word_catalog (
 id text primary key, word text not null, phonetic text not null, meaning text not null, example text not null,
 translation text not null, level text not null, reviewed boolean not null default false, source text not null, frequency_rank integer check(frequency_rank>0)
);
create function private.valid_ids(p jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p)='array' and not exists(select 1 from jsonb_array_elements(p) e where jsonb_typeof(e)<>'string')
 and jsonb_array_length(p)=(select count(distinct x) from jsonb_array_elements_text(p) x)
$$;
create function private.valid_state(p jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare d jsonb; i int:=0; deck text[]; known text[]; waiting text[]; all_ids text[]; total int;
begin
 if p is null or not(p ?& array['version','deck_ids','mastered','pending','days','activeDay']) or octet_length(p::text)>1048576 or p->>'version'<>'3' or jsonb_typeof(p->'version') is distinct from 'number' then return false;end if;
 if not private.valid_ids(p->'deck_ids') or not private.valid_ids(p->'mastered') or not private.valid_ids(p->'pending') then return false;end if;
 select array_agg(x) into deck from jsonb_array_elements_text(p->'deck_ids') x;
 select coalesce(array_agg(x),array[]::text[]) into known from jsonb_array_elements_text(p->'mastered') x;
 select coalesce(array_agg(x),array[]::text[]) into waiting from jsonb_array_elements_text(p->'pending') x;
 if coalesce(cardinality(deck),0)<1 or cardinality(deck)>5000 or exists(select 1 from unnest(deck) x where not exists(select 1 from public.word_catalog where id=x and reviewed)) then return false;end if;
 if jsonb_typeof(p->'days')<>'array' or jsonb_array_length(p->'days')<1 or jsonb_array_length(p->'days')>2000 then return false;end if;
 total:=jsonb_array_length(p->'days');
 if jsonb_typeof(p->'activeDay') is distinct from 'number' or (p->>'activeDay')::int<0 or (p->>'activeDay')::int>=total then return false;end if;
 for d in select * from jsonb_array_elements(p->'days') loop
  if not private.valid_ids(d->'ids') or jsonb_array_length(d->'ids') not between 1 and 43 or exists(select 1 from jsonb_array_elements_text(d->'ids') x where not(x=any(deck))) then return false;end if;
  if not(d ?& array['date','ids','first','review','closed']) or jsonb_typeof(d->'date') is distinct from 'string' or not(d->>'date' ~ '^\d{4}-\d{2}-\d{2}$') or jsonb_typeof(d->'closed') is distinct from 'boolean' or (d->>'closed')::boolean<>(i<total-1) then return false;end if;
  if jsonb_typeof(d->'first') is distinct from 'array' or jsonb_typeof(d->'review') is distinct from 'array' then return false;end if;
  if jsonb_array_length(d->'first')>jsonb_array_length(d->'ids') or
     jsonb_array_length(d->'review')>(select count(*) from jsonb_array_elements(d->'first') x where x='false'::jsonb) or
     (jsonb_array_length(d->'review')>0 and jsonb_array_length(d->'first')<>jsonb_array_length(d->'ids')) or
     exists(select 1 from jsonb_array_elements((d->'first')||(d->'review')) x where jsonb_typeof(x)<>'boolean') then return false;end if;
  i:=i+1;
 end loop;
 select coalesce(array_agg(x),array[]::text[]) into all_ids from jsonb_array_elements_text((p->'days'->(total-1))->'ids') x where not(x=any(known));
 all_ids:=known||all_ids||waiting;
 if cardinality(all_ids)<>cardinality(deck) or (select count(distinct x) from unnest(all_ids) x)<>cardinality(deck) or exists(select 1 from unnest(all_ids) x where not(x=any(deck))) then return false;end if;
 if p ? 'next_day_ids' and (not private.valid_ids(p->'next_day_ids') or jsonb_array_length(p->'next_day_ids')>43 or exists(select 1 from jsonb_array_elements_text(p->'next_day_ids') x where not(x=any(deck)) or x=any(known))) then return false;end if;
 return true;
exception when others then return false;
end $$;
create table public.study_progress (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null check(private.valid_state(state)),revision bigint not null default 1 check(revision>0),updated_at timestamptz not null default now()
);
create table public.assessment_events (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 word_id text not null references public.word_catalog(id),choice_id text not null references public.word_catalog(id),
 correct boolean not null,assisted boolean not null default false,created_at timestamptz not null default now()
);
create index on public.assessment_events(user_id,created_at desc);
create table public.recommendations (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 progress_revision bigint not null,word_ids text[] not null,rationale text not null check(length(rationale)<=1500),
 status text not null default 'pending' check(status in ('pending','accepted','ignored')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',adopted_revision bigint
);
create index on public.recommendations(user_id,created_at desc);
create table private.coach_requests(user_id uuid not null,window_start timestamptz not null,count int not null,primary key(user_id,window_start));
alter table public.profiles enable row level security;
alter table public.word_catalog enable row level security;
alter table public.study_progress enable row level security;
alter table public.assessment_events enable row level security;
alter table public.recommendations enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid() or private.admin());
create policy catalog_read on public.word_catalog for select to authenticated using(reviewed and private.active(auth.uid()));
create policy own_progress on public.study_progress for select to authenticated using(user_id=auth.uid() and private.active(auth.uid()));
create policy own_events on public.assessment_events for select to authenticated using(user_id=auth.uid() and private.active(auth.uid()));
create policy own_recommendations on public.recommendations for select to authenticated using(user_id=auth.uid() and private.active(auth.uid()));
revoke all on public.profiles,public.word_catalog,public.study_progress,public.assessment_events,public.recommendations from anon,authenticated;
grant select on public.profiles,public.word_catalog,public.study_progress,public.assessment_events,public.recommendations to authenticated;
grant all on public.profiles,public.word_catalog,public.study_progress,public.assessment_events,public.recommendations to service_role;

create function public.save_progress(p_expected_revision bigint,p_state jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.study_progress;who uuid:=auth.uid();
begin
 if not private.active(who) then raise insufficient_privilege using message='account_disabled';end if;
 if not private.valid_state(p_state) then raise check_violation using message='invalid_progress';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into r from public.study_progress where user_id=who for update;
 if coalesce(r.revision,0)<>p_expected_revision then raise sqlstate 'PT409' using message='revision_conflict';end if;
 insert into public.study_progress(user_id,state) values(who,p_state)
 on conflict(user_id) do update set state=excluded.state,revision=public.study_progress.revision+1,updated_at=now() returning * into r;
 return to_jsonb(r)-'user_id';
end $$;
create function public.set_account_status(p_target uuid,p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.admin() then raise insufficient_privilege using message='admin_required';end if;
 if p_enabled is null then raise check_violation;end if;
 if exists(select 1 from public.profiles where id=p_target and role='admin') then raise insufficient_privilege using message='cannot_disable_admin';end if;
 update public.profiles set enabled=p_enabled where id=p_target;
 if not found then raise no_data_found;end if;
 return jsonb_build_object('id',p_target,'enabled',p_enabled);
end $$;
create function public.list_accounts(p_search text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;total bigint;
begin
 if not private.admin() then raise insufficient_privilege using message='admin_required';end if;
 if p_page<1 or p_page>10000 or length(p_search)>100 then raise check_violation;end if;
 select count(*) into total from public.profiles where email ilike '%'||p_search||'%';
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (
 select p.id,p.email,p.role,p.enabled,p.created_at,u.last_sign_in_at from public.profiles p join auth.users u on u.id=p.id
 where p.email ilike '%'||p_search||'%' order by p.created_at,p.id limit 20 offset (p_page-1)*20) t;
 return jsonb_build_object('users',rows,'total',total,'page',p_page);
end $$;
create function public.submit_assessment(p_event_id uuid,p_word_id text,p_choice_id text,p_assisted boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.assessment_events;who uuid:=auth.uid();
begin
 if not private.active(who) then raise insufficient_privilege using message='account_disabled';end if;
 if not exists(select 1 from public.word_catalog where id=p_word_id and reviewed) or not exists(select 1 from public.word_catalog where id=p_choice_id and reviewed) or p_assisted is null then raise check_violation using message='invalid_assessment';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,1));
 select * into r from public.assessment_events where id=p_event_id;
 if found then
  if r.user_id<>who or r.word_id<>p_word_id or r.choice_id<>p_choice_id or r.assisted<>p_assisted then raise sqlstate 'PT409' using message='event_conflict';end if;
 else
  insert into public.assessment_events(id,user_id,word_id,choice_id,correct,assisted) values(p_event_id,who,p_word_id,p_choice_id,p_word_id=p_choice_id,p_assisted) returning * into r;
 end if;
 return to_jsonb(r)-'user_id';
end $$;
create function public.coach_rate_limit(p_owner uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not private.active(p_owner) then raise insufficient_privilege using message='account_disabled';end if;
 delete from private.coach_requests where window_start<now()-interval '10 minutes';
 insert into private.coach_requests values(p_owner,date_trunc('minute',now()),1)
 on conflict(user_id,window_start) do update set count=private.coach_requests.count+1 returning count into n;
 if n>60 then raise sqlstate 'PT429' using message='rate_limited';end if;return true;
end $$;
create function private.check_proposal(p public.study_progress,p_ids text[]) returns boolean language plpgsql stable security definer set search_path='' as $$
declare carry text[];known text[];
begin
 if coalesce(cardinality(p_ids),0) not between 1 and 43 or (select count(distinct x) from unnest(p_ids) x)<>cardinality(p_ids) then return false;end if;
 select coalesce(array_agg(x),array[]::text[]) into known from jsonb_array_elements_text(p.state->'mastered') x;
 if exists(select 1 from unnest(p_ids) x where x=any(known) or not exists(select 1 from public.word_catalog where id=x and reviewed)) then return false;end if;
 select coalesce(array_agg(x),array[]::text[]) into carry from jsonb_array_elements_text(p.state->'days'->(jsonb_array_length(p.state->'days')-1)->'ids') x where not(x=any(known));
 return (select count(distinct x) from unnest(carry||p_ids) x)<=43;
end $$;
create function public.coach_create_recommendation(p_owner uuid,p_id uuid,p_expected_revision bigint,p_word_ids text[],p_rationale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.study_progress;r public.recommendations;
begin
 if not private.active(p_owner) then raise insufficient_privilege using message='account_disabled';end if;
 if p_rationale is null or length(p_rationale)>1500 then raise check_violation using message='invalid_recommendation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into r from public.recommendations where id=p_id;
 if found then
  if r.user_id<>p_owner or r.progress_revision<>p_expected_revision or r.word_ids<>p_word_ids or r.rationale<>p_rationale then raise sqlstate 'PT409' using message='recommendation_conflict';end if;
  return to_jsonb(r)-'user_id';
 end if;
 select * into p from public.study_progress where user_id=p_owner;
 if p.revision is null or p.revision<>p_expected_revision then raise sqlstate 'PT409' using message='revision_conflict';end if;
 if not private.check_proposal(p,p_word_ids) then raise check_violation using message='invalid_recommendation';end if;
 insert into public.recommendations(id,user_id,progress_revision,word_ids,rationale) values(p_id,p_owner,p_expected_revision,p_word_ids,p_rationale) returning * into r;
 return to_jsonb(r)-'user_id';
end $$;
create function public.adopt_recommendation(p_id uuid,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.recommendations;p public.study_progress;who uuid:=auth.uid();v_state jsonb;deck text[];pending text[];x text;
begin
 if not private.active(who) then raise insufficient_privilege using message='account_disabled';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into r from public.recommendations where id=p_id and user_id=who for update;
 if not found then raise insufficient_privilege;end if;
 select * into p from public.study_progress where user_id=who for update;
 if r.status='accepted' then return (to_jsonb(p)-'user_id')||jsonb_build_object('already_applied',true);end if;
 if r.status<>'pending' or r.expires_at<now() or r.progress_revision<>p.revision or p.revision<>p_expected_revision then raise sqlstate 'PT409' using message='revision_conflict';end if;
 if not private.check_proposal(p,r.word_ids) then raise check_violation using message='invalid_recommendation';end if;
 v_state:=p.state;
 select array_agg(value) into deck from jsonb_array_elements_text(v_state->'deck_ids');
 select coalesce(array_agg(value),array[]::text[]) into pending from jsonb_array_elements_text(v_state->'pending');
 foreach x in array r.word_ids loop
  if not(x=any(deck)) then deck:=array_append(deck,x);pending:=array_append(pending,x);end if;
 end loop;
 v_state:=v_state||jsonb_build_object('deck_ids',to_jsonb(deck),'dictionaryId',array_to_string(deck,'|'),'pending',to_jsonb(pending),'next_day_ids',to_jsonb(r.word_ids));
 update public.study_progress set state=v_state,revision=revision+1,updated_at=now() where user_id=who returning * into p;
 update public.recommendations set status='accepted',adopted_revision=p.revision where id=p_id;
 return (to_jsonb(p)-'user_id')||jsonb_build_object('already_applied',false);
end $$;
create function public.dismiss_recommendation(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.active(auth.uid()) then raise insufficient_privilege;end if;
 update public.recommendations set status='ignored' where id=p_id and user_id=auth.uid() and status='pending';return found;
end $$;
-- Deny default PUBLIC function execution, including custom-schema helpers.
revoke all on all functions in schema private from public;
grant execute on function private.active(uuid),private.admin() to authenticated;
revoke all on function public.save_progress(bigint,jsonb),public.set_account_status(uuid,boolean),public.list_accounts(text,integer),public.submit_assessment(uuid,text,text,boolean),public.adopt_recommendation(uuid,bigint),public.dismiss_recommendation(uuid),public.coach_rate_limit(uuid),public.coach_create_recommendation(uuid,uuid,bigint,text[],text) from public,anon,authenticated;
grant execute on function public.save_progress(bigint,jsonb),public.set_account_status(uuid,boolean),public.list_accounts(text,integer),public.submit_assessment(uuid,text,text,boolean),public.adopt_recommendation(uuid,bigint),public.dismiss_recommendation(uuid) to authenticated;
grant execute on function public.coach_rate_limit(uuid),public.coach_create_recommendation(uuid,uuid,bigint,text[],text) to service_role;
commit;
