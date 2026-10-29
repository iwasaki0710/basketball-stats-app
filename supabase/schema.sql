-- Fresh Supabase projects only. For existing projects apply only unapplied migrations.
-- 001_initial.sql
-- Run once in Supabase SQL editor. No service-role key is used by the browser.
begin;
create table public.teams (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80), created_at timestamptz not null default now());
create table public.memberships (team_id uuid not null references public.teams on delete cascade,user_id uuid not null references auth.users on delete cascade,role text not null check(role in ('admin','recorder','viewer')),primary key(team_id,user_id));
create table public.workspaces (team_id uuid primary key references public.teams on delete cascade, revision bigint not null default 0, data jsonb, updated_at timestamptz not null default now());
create table public.seasons (team_id uuid not null references public.teams on delete cascade,id text not null,primary key(team_id,id));
create table public.players (team_id uuid not null references public.teams on delete cascade,id text not null,name text not null,number int not null check(number between 0 and 99),position text not null check(position in ('PG','SG','SF','PF','C')),year int not null check(year between 1 and 6),height int not null check(height between 100 and 250),season_id text not null,primary key(team_id,id),foreign key(team_id,season_id) references public.seasons(team_id,id),unique(team_id,season_id,number));
create table public.games (team_id uuid not null references public.teams on delete cascade,id text not null,opponent text not null,game_date timestamp not null,venue text not null,competition text not null,season_id text not null,home boolean not null,status text not null check(status in ('scheduled','live','finished')),quarter_seconds int not null check(quarter_seconds between 60 and 1200),regulation_quarters int not null,current_quarter int not null,remaining int not null,recording_start numeric not null default 0,primary key(team_id,id),foreign key(team_id,season_id) references public.seasons(team_id,id));
create table public.game_rosters (team_id uuid not null,game_id text not null,player_id text not null,starter boolean not null,primary key(team_id,game_id,player_id),foreign key(team_id,game_id) references public.games(team_id,id) on delete cascade,foreign key(team_id,player_id) references public.players(team_id,id));
create table public.play_events (team_id uuid not null,game_id text not null,id text not null,sequence int not null,kind text not null check(kind in ('2PM','2PX','3PM','3PX','FTM','FTX','OREB','DREB','AST','STL','BLK','TOV','PF','OPP2','OPP3','OPPFT','SUB')),player_id text,in_player_id text,quarter int not null check(quarter between 1 and 20),elapsed numeric not null check(elapsed>=0),shot_x numeric check(shot_x between 0 and 100),shot_y numeric check(shot_y between 0 and 100),check((shot_x is null)=(shot_y is null)),check(shot_x is null or kind in ('2PM','2PX','3PM','3PX')),primary key(team_id,game_id,id),unique(team_id,game_id,sequence),foreign key(team_id,game_id) references public.games(team_id,id) on delete cascade,foreign key(team_id,player_id) references public.players(team_id,id),foreign key(team_id,in_player_id) references public.players(team_id,id));
create index memberships_user_idx on public.memberships(user_id);
create index game_season_idx on public.games(team_id,season_id);
create index event_order_idx on public.play_events(team_id,game_id,sequence);
create function public.team_role(p_team uuid) returns text language sql stable security definer set search_path=public as $$select role from public.memberships where team_id=p_team and user_id=auth.uid()$$;
revoke all on function public.team_role(uuid) from public;
grant execute on function public.team_role(uuid) to authenticated;
do $$declare t text;begin foreach t in array array['teams','memberships','workspaces','seasons','players','games','game_rosters','play_events'] loop execute format('alter table public.%I enable row level security',t);if t='teams' then execute 'create policy team_read on public.teams for select to authenticated using (public.team_role(id) is not null)';else execute format('create policy member_read on public.%I for select to authenticated using (public.team_role(team_id) is not null)',t);end if;execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);end loop;end$$;
-- All writes go through narrow functions, with explicit team authorization.
create function public.create_team(p_name text) returns uuid language plpgsql security definer set search_path=public as $$declare v_id uuid;begin if auth.uid() is null then raise exception 'authentication_required';end if;if length(trim(p_name)) not between 1 and 80 then raise exception 'invalid_team_name';end if;insert into teams(name) values(trim(p_name)) returning id into v_id;insert into memberships values(v_id,auth.uid(),'admin');insert into workspaces(team_id) values(v_id);return v_id;end$$;
create function public.add_team_member(p_team uuid,p_email text,p_role text) returns void language plpgsql security definer set search_path=public as $$declare v_user uuid;begin if public.team_role(p_team) is distinct from 'admin' then raise exception 'admin_required';end if;if p_role not in ('admin','recorder','viewer') then raise exception 'invalid_role';end if;select id into v_user from auth.users where lower(email)=lower(trim(p_email));if v_user is null then raise exception 'ユーザーが未登録です。先にマジックリンクでログインしてください。';end if;if v_user=auth.uid() then raise exception '自分自身の権限は変更できません';end if;insert into memberships values(p_team,v_user,p_role) on conflict(team_id,user_id) do update set role=excluded.role;end$$;
create function public.save_workspace(p_team uuid,p_expected_revision bigint,p_data jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare v_revision bigint; p jsonb; g jsonb; e jsonb; item jsonb; v_seq int; v_last numeric; v_on text[]; v_id text; v_in text; v_q int; v_start int; v_period int; v_elapsed numeric;begin
if coalesce(public.team_role(p_team),'') not in ('admin','recorder') then raise exception 'write_access_required';end if;
if public.team_role(p_team)='recorder' and (p_data->>'teamName') is distinct from (select name from teams where id=p_team) then raise exception 'admin_required_for_team_settings';end if;
select revision into v_revision from workspaces where team_id=p_team for update;
if v_revision is null or v_revision<>p_expected_revision then raise exception 'revision_conflict';end if;
if (p_data->>'version') is distinct from '1' or length(p_data->>'teamName') not between 1 and 80 or length(p_data->>'season') not between 1 and 20 or jsonb_typeof(p_data->'players') is distinct from 'array' or jsonb_typeof(p_data->'games') is distinct from 'array' then raise exception 'invalid_workspace';end if;
if jsonb_array_length(p_data->'players')>100 or jsonb_array_length(p_data->'games')>1000 then raise exception 'workspace_too_large';end if;
-- Validation and normalized writes share one transaction. Failed validation rolls back everything.
delete from games where team_id=p_team;delete from players where team_id=p_team;delete from seasons where team_id=p_team;
insert into seasons values(p_team,p_data->>'season');
for p in select value from jsonb_array_elements(p_data->'players') loop
if length(p->>'name') not between 1 and 80 or length(p->>'id') not between 1 and 100 then raise exception 'invalid_player';end if;
insert into seasons values(p_team,p->>'season') on conflict do nothing;
insert into players values(p_team,p->>'id',p->>'name',(p->>'number')::int,p->>'position',(p->>'year')::int,(p->>'height')::int,p->>'season');end loop;
for g in select value from jsonb_array_elements(p_data->'games') loop
if jsonb_array_length(g->'starters')<>5 or jsonb_array_length(g->'events')>100000 or length(g->>'opponent') not between 1 and 100 or (g->>'quarters')::int not between 1 and 8 or (g->>'quarter')::int not between 1 and 20 then raise exception 'invalid_game';end if;
insert into seasons values(p_team,g->>'season') on conflict do nothing;
insert into games values(p_team,g->>'id',g->>'opponent',(g->>'date')::timestamp,g->>'venue',g->>'competition',g->>'season',(g->>'home')::boolean,g->>'status',(g->>'quarterSeconds')::int,(g->>'quarters')::int,(g->>'quarter')::int,(g->>'remaining')::int,coalesce((g->>'recordingStart')::numeric,0));
v_on=array(select jsonb_array_elements_text(g->'starters'));
if cardinality(array(select distinct unnest(v_on)))<>5 then raise exception 'invalid_starters';end if;
for item in select value from jsonb_array_elements(g->'roster') loop insert into game_rosters values(p_team,g->>'id',item#>>'{}',(item#>>'{}')=any(v_on));end loop;
if exists(select 1 from unnest(v_on) s where not exists(select 1 from game_rosters r where r.team_id=p_team and r.game_id=g->>'id' and r.player_id=s)) then raise exception 'starter_not_in_roster';end if;
v_seq=0;v_last=coalesce((g->>'recordingStart')::numeric,0);if v_last<0 then raise exception 'invalid_recording_start';end if;
for e in select value from jsonb_array_elements(g->'events') loop
v_id=nullif(e->>'playerId','');v_in=e->>'inId';v_q=(e->>'quarter')::int;v_elapsed=(e->>'elapsed')::numeric;
v_period=case when v_q>(g->>'quarters')::int then 300 else (g->>'quarterSeconds')::int end;
v_start=case when v_q>(g->>'quarters')::int then (g->>'quarters')::int*(g->>'quarterSeconds')::int+(v_q-(g->>'quarters')::int-1)*300 else (v_q-1)*(g->>'quarterSeconds')::int end;
if v_elapsed<v_last or v_elapsed<v_start or v_elapsed>v_start+v_period then raise exception 'invalid_event_time';end if;
v_last=v_elapsed;
if e->>'kind'='SUB' then
 if v_id is null or not(v_id=any(v_on)) or v_in is null or v_in=any(v_on) or not exists(select 1 from game_rosters where team_id=p_team and game_id=g->>'id' and player_id=v_in) then raise exception 'invalid_substitution';end if;
 v_on=array_append(array_remove(v_on,v_id),v_in);
elsif e->>'kind' not like 'OPP%' then
 if v_id is null or not(v_id=any(v_on)) then raise exception 'player_not_on_court';end if;
end if;
insert into play_events values(p_team,g->>'id',e->>'id',v_seq,e->>'kind',v_id,v_in,v_q,v_elapsed,(e->>'x')::numeric,(e->>'y')::numeric);v_seq=v_seq+1;
end loop;
v_q=(g->>'quarter')::int;v_period=case when v_q>(g->>'quarters')::int then 300 else (g->>'quarterSeconds')::int end;
v_start=case when v_q>(g->>'quarters')::int then (g->>'quarters')::int*(g->>'quarterSeconds')::int+(v_q-(g->>'quarters')::int-1)*300 else (v_q-1)*(g->>'quarterSeconds')::int end;
if (g->>'remaining')::int not between 0 and v_period or v_last>v_start+v_period-(g->>'remaining')::int then raise exception 'clock_precedes_events';end if;
end loop;
update workspaces set data=p_data,revision=revision+1,updated_at=now() where team_id=p_team returning revision into v_revision;
update teams set name=p_data->>'teamName' where id=p_team;
return v_revision;
end$$;
revoke all on function public.create_team(text),public.add_team_member(uuid,text,text),public.save_workspace(uuid,bigint,jsonb) from public;
grant execute on function public.create_team(text),public.add_team_member(uuid,text,text),public.save_workspace(uuid,bigint,jsonb) to authenticated;
commit;

-- 002_complete_recording.sql
-- Apply after 001_initial.sql. Existing events and memberships are preserved.
begin;
alter table public.players add column photo text check(photo is null or (length(photo)<=100000 and photo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$'));
alter table public.games add column clock_target bigint check(clock_target is null or clock_target>=0);
alter table public.games add column opponent_stats_complete boolean not null default false;
alter table public.play_events add column side text not null default 'own' check(side in ('own','opponent'));
update public.play_events set side='opponent' where kind like 'OPP%';
create or replace function public.save_workspace(p_team uuid,p_expected_revision bigint,p_data jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare v_revision bigint; p jsonb; g jsonb; e jsonb; item jsonb; v_seq int; v_last numeric; v_on text[]; v_id text; v_in text; v_q int; v_start int; v_period int; v_elapsed numeric;begin
if coalesce(public.team_role(p_team),'') not in ('admin','recorder') then raise exception 'write_access_required';end if;
if public.team_role(p_team)='recorder' and (p_data->>'teamName') is distinct from (select name from teams where id=p_team) then raise exception 'admin_required_for_team_settings';end if;
select revision into v_revision from workspaces where team_id=p_team for update;
if v_revision is null or v_revision<>p_expected_revision then raise exception 'revision_conflict';end if;
if (p_data->>'version') is distinct from '1' or length(p_data->>'teamName') not between 1 and 80 or length(p_data->>'season') not between 1 and 20 or jsonb_typeof(p_data->'players') is distinct from 'array' or jsonb_typeof(p_data->'games') is distinct from 'array' then raise exception 'invalid_workspace';end if;
if jsonb_array_length(p_data->'players')>100 or jsonb_array_length(p_data->'games')>1000 then raise exception 'workspace_too_large';end if;
-- Validation and normalized writes share one transaction. Failed validation rolls back everything.
delete from games where team_id=p_team;delete from players where team_id=p_team;delete from seasons where team_id=p_team;
insert into seasons values(p_team,p_data->>'season');
for p in select value from jsonb_array_elements(p_data->'players') loop
if length(p->>'name') not between 1 and 80 or length(p->>'id') not between 1 and 100 then raise exception 'invalid_player';end if;
if p->>'photo' is not null and (length(p->>'photo')>100000 or p->>'photo' !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$') then raise exception 'invalid_photo';end if;
insert into seasons values(p_team,p->>'season') on conflict do nothing;
insert into players values(p_team,p->>'id',p->>'name',(p->>'number')::int,p->>'position',(p->>'year')::int,(p->>'height')::int,p->>'season',p->>'photo');end loop;
for g in select value from jsonb_array_elements(p_data->'games') loop
if jsonb_array_length(g->'starters')<>5 or jsonb_array_length(g->'events')>100000 or length(g->>'opponent') not between 1 and 100 or (g->>'quarters')::int not between 1 and 8 or (g->>'quarter')::int not between 1 and 20 then raise exception 'invalid_game';end if;
insert into seasons values(p_team,g->>'season') on conflict do nothing;
insert into games values(p_team,g->>'id',g->>'opponent',(g->>'date')::timestamp,g->>'venue',g->>'competition',g->>'season',(g->>'home')::boolean,g->>'status',(g->>'quarterSeconds')::int,(g->>'quarters')::int,(g->>'quarter')::int,(g->>'remaining')::int,coalesce((g->>'recordingStart')::numeric,0),(g->>'clockTarget')::bigint,coalesce((g->>'opponentStatsComplete')::boolean,false));
v_on=array(select jsonb_array_elements_text(g->'starters'));
if cardinality(array(select distinct unnest(v_on)))<>5 then raise exception 'invalid_starters';end if;
for item in select value from jsonb_array_elements(g->'roster') loop insert into game_rosters values(p_team,g->>'id',item#>>'{}',(item#>>'{}')=any(v_on));end loop;
if exists(select 1 from unnest(v_on) s where not exists(select 1 from game_rosters r where r.team_id=p_team and r.game_id=g->>'id' and r.player_id=s)) then raise exception 'starter_not_in_roster';end if;
v_seq=0;v_last=coalesce((g->>'recordingStart')::numeric,0);if v_last<0 then raise exception 'invalid_recording_start';end if;
for e in select value from jsonb_array_elements(g->'events') loop
v_id=nullif(e->>'playerId','');v_in=e->>'inId';v_q=(e->>'quarter')::int;v_elapsed=(e->>'elapsed')::numeric;
v_period=case when v_q>(g->>'quarters')::int then 300 else (g->>'quarterSeconds')::int end;
v_start=case when v_q>(g->>'quarters')::int then (g->>'quarters')::int*(g->>'quarterSeconds')::int+(v_q-(g->>'quarters')::int-1)*300 else (v_q-1)*(g->>'quarterSeconds')::int end;
if v_elapsed<v_last or v_elapsed<v_start or v_elapsed>v_start+v_period then raise exception 'invalid_event_time';end if;
v_last=v_elapsed;
if coalesce(e->>'side','own') not in ('own','opponent') then raise exception 'invalid_event_side';end if;
if e->>'kind'='SUB' then
 if e->>'side'='opponent' then raise exception 'invalid_opponent_substitution';end if;
 if v_id is null or not(v_id=any(v_on)) or v_in is null or v_in=any(v_on) or not exists(select 1 from game_rosters where team_id=p_team and game_id=g->>'id' and player_id=v_in) then raise exception 'invalid_substitution';end if;
 v_on=array_append(array_remove(v_on,v_id),v_in);
elsif e->>'kind' not like 'OPP%' and coalesce(e->>'side','own') <> 'opponent' then
 if v_id is null or not(v_id=any(v_on)) then raise exception 'player_not_on_court';end if;
end if;
insert into play_events values(p_team,g->>'id',e->>'id',v_seq,e->>'kind',v_id,v_in,v_q,v_elapsed,(e->>'x')::numeric,(e->>'y')::numeric,case when e->>'kind' like 'OPP%' or e->>'side'='opponent' then 'opponent' else 'own' end);v_seq=v_seq+1;
end loop;
v_q=(g->>'quarter')::int;v_period=case when v_q>(g->>'quarters')::int then 300 else (g->>'quarterSeconds')::int end;
v_start=case when v_q>(g->>'quarters')::int then (g->>'quarters')::int*(g->>'quarterSeconds')::int+(v_q-(g->>'quarters')::int-1)*300 else (v_q-1)*(g->>'quarterSeconds')::int end;
if (g->>'remaining')::int not between 0 and v_period or v_last>v_start+v_period-(g->>'remaining')::int then raise exception 'clock_precedes_events';end if;
end loop;
update workspaces set data=p_data,revision=revision+1,updated_at=now() where team_id=p_team returning revision into v_revision;
update teams set name=p_data->>'teamName' where id=p_team;
return v_revision;
end$$;

commit;
