-- =========================================================
-- 교회 출석부 - Supabase(Postgres) 최종 수정 스크립트
-- =========================================================

create extension if not exists pgcrypto;

-- 1) 문서 테이블
create table if not exists fs_documents (
  path        text primary key,
  parent      text not null default '',
  collection  text not null,
  doc_id      text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists fs_documents_parent_collection_idx on fs_documents (parent, collection);
create index if not exists fs_documents_collection_idx on fs_documents (collection);
create index if not exists fs_documents_data_gin_idx on fs_documents using gin (data);

alter table fs_documents enable row level security;

-- 2) 헬퍼 함수들
create or replace function my_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function fs_get(p_path text) returns jsonb
language sql stable as $$
  select data from fs_documents where path = p_path;
$$;

create or replace function my_contexts() returns jsonb
language sql stable as $$
  select coalesce(fs_get('roles/' || my_email()) -> 'contexts', '[]'::jsonb);
$$;

create or replace function my_church_ids() returns jsonb
language sql stable as $$
  select coalesce(fs_get('roles/' || my_email()) -> 'churchIds', '[]'::jsonb);
$$;

create or replace function my_approved_church_ids() returns jsonb
language sql stable as $$
  select coalesce(fs_get('roles/' || my_email()) -> 'approvedChurchIds', '[]'::jsonb);
$$;

create or replace function jsonb_list_has_text(list jsonb, val text) returns boolean
language sql stable as $$
  select exists (select 1 from jsonb_array_elements_text(coalesce(list, '[]'::jsonb)) e where e = val);
$$;

create or replace function has_context(ctx jsonb) returns boolean
language sql stable as $$
  select my_email() <> '' and exists (
    select 1 from jsonb_array_elements(my_contexts()) c where c = ctx
  );
$$;

create or replace function is_admin_of(p_church_id text) returns boolean
language sql stable as $$
  select has_context(jsonb_build_object('role','admin','churchId',p_church_id));
$$;

create or replace function is_operator_of(p_church_id text, p_category_id text) returns boolean
language sql stable as $$
  select has_context(jsonb_build_object('role','operator','churchId',p_church_id,'categoryId',p_category_id));
$$;

create or replace function is_leader_of(p_church_id text, p_group_id text) returns boolean
language sql stable as $$
  select has_context(jsonb_build_object('role','leader','churchId',p_church_id,'groupId',p_group_id));
$$;

create or replace function has_approved_role_in(p_church_id text) returns boolean
language sql stable as $$
  select my_email() <> '' and jsonb_list_has_text(my_approved_church_ids(), p_church_id);
$$;

create or replace function category_of_group(p_church_id text, p_group_id text) returns text
language sql stable as $$
  select fs_get('churches/' || p_church_id || '/groups/' || p_group_id) ->> 'categoryId';
$$;

-- ★ [수정 핵심 1] ctx(operator / leader)를 부여·회수할 자격 여부
create or replace function context_change_allowed(ctx jsonb) returns boolean
language plpgsql stable as $$
declare
  v_role text := ctx ->> 'role';
  v_church_id text := ctx ->> 'churchId';
  v_group_id text := ctx ->> 'groupId';
  v_category_id text := ctx ->> 'categoryId';
begin
  if v_role = 'operator' then
    -- 운영자 권한 부여/해제: 담임/관리자(admin)만 가능
    return is_admin_of(v_church_id);
  elsif v_role = 'leader' then
    -- 리더 권한 부여/해제: 관리자(admin), 해당 카테고리의 운영자(operator), 또는 동일 그룹의 기존 리더(leader) 가능
    return is_admin_of(v_church_id)
      or is_operator_of(v_church_id, category_of_group(v_church_id, v_group_id))
      or is_leader_of(v_church_id, v_group_id);
  else
    return false;
  end if;
end;
$$;

create or replace function jsonb_array_diff(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  from jsonb_array_elements(coalesce(a, '[]'::jsonb)) elem
  where not exists (
    select 1 from jsonb_array_elements(coalesce(b, '[]'::jsonb)) belem where elem = belem
  );
$$;

-- 3) 읽기/쓰기 RLS Policy
drop policy if exists fs_select on fs_documents;
drop policy if exists fs_insert on fs_documents;
drop policy if exists fs_update on fs_documents;
drop policy if exists fs_delete on fs_documents;

create policy fs_select on fs_documents for select using (
  case collection
    when 'churches'   then true
    when 'categories' then my_email() <> ''
    when 'groups'     then my_email() <> ''
    when 'members'    then my_email() <> ''
    when 'attendance' then my_email() <> ''
    when 'notices'    then my_email() <> '' and jsonb_list_has_text(my_church_ids(), split_part(parent, '/', 2))
    when 'roles'      then my_email() <> '' and (
                              doc_id = my_email()
                              or exists (
                                   select 1 from jsonb_array_elements_text(coalesce(data->'churchIds','[]'::jsonb)) cid
                                   where jsonb_list_has_text(my_approved_church_ids(), cid)
                                 )
                            )
    when 'users'      then my_email() <> '' and (
                              doc_id = my_email()
                              or jsonb_list_has_text(my_church_ids(), data->>'churchId')
                            )
    else false
  end
);

create policy fs_insert on fs_documents for insert with check (true);
create policy fs_update on fs_documents for update using (true) with check (true);
create policy fs_delete on fs_documents for delete using (true);

-- 4) 쓰기 권한 트리거
create or replace function fs_authorize() returns trigger
language plpgsql as $$
declare
  v_collection text := coalesce(new.collection, old.collection);
  church_id text;
  old_group_id text;
  new_group_id text;
  old_category_id text;
  new_category_id text;
  added jsonb;
  removed jsonb;
  owner_email text;
begin
  -- RPC 배치 처리(fs_batch/fs_cas_batch) 세션인 경우 검사 우회
  if current_setting('app.bypass_fs_authorize', true) = 'true' then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;

  -- churches
  if v_collection = 'churches' and TG_OP = 'INSERT' then
    church_id := new.doc_id;
    if not (my_email() <> '' and lower(new.data->>'ownerEmail') = my_email()) then
      raise exception '교회 생성 권한이 없습니다.' using errcode = '42501';
    end if;
    return new;
  end if;
  if v_collection = 'churches' and (TG_OP = 'UPDATE' or TG_OP = 'DELETE') then
    church_id := old.doc_id;
    if not is_admin_of(church_id) then
      raise exception '교회 정보를 수정/삭제할 권한이 없습니다.' using errcode = '42501';
    end if;
    if TG_OP = 'UPDATE' and (new.data ? 'logoUrl') and new.data->>'logoUrl' is not null
       and length(new.data->>'logoUrl') >= 800000 then
      raise exception '로고 이미지가 너무 큽니다.' using errcode = '42501';
    end if;
    if TG_OP = 'UPDATE' then return new; else return old; end if;
  end if;

  -- categories
  if v_collection = 'categories' then
    church_id := split_part(coalesce(new.parent, old.parent), '/', 2);
    if TG_OP = 'INSERT' then
      if not is_admin_of(church_id) then
        raise exception '카테고리 생성 권한이 없습니다.' using errcode = '42501';
      end if;
      return new;
    else
      if not (is_admin_of(church_id) or is_operator_of(church_id, old.doc_id)) then
        raise exception '카테고리 수정/삭제 권한이 없습니다.' using errcode = '42501';
      end if;
      if TG_OP = 'UPDATE' then return new; else return old; end if;
    end if;
  end if;

  -- ★ [수정 핵심 2] groups (운영자가 그룹 생성/수정 가능)
  if v_collection = 'groups' then
    church_id := split_part(coalesce(new.parent, old.parent), '/', 2);
    if TG_OP = 'INSERT' then
      new_category_id := new.data->>'categoryId';
      if not (is_admin_of(church_id) or is_operator_of(church_id, new_category_id)) then
        raise exception '그룹 생성 권한이 없습니다.' using errcode = '42501';
      end if;
      return new;
    else
      old_category_id := old.data->>'categoryId';
      if not (is_admin_of(church_id) or is_operator_of(church_id, old_category_id) or is_leader_of(church_id, old.doc_id)) then
        raise exception '그룹 수정/삭제 권한이 없습니다.' using errcode = '42501';
      end if;
      if TG_OP = 'UPDATE' then return new; else return old; end if;
    end if;
  end if;

  -- members
  if v_collection = 'members' then
    church_id := split_part(coalesce(new.parent, old.parent), '/', 2);
    if TG_OP = 'INSERT' then
      new_group_id := new.data->>'groupId';
      if not (is_admin_of(church_id) or is_leader_of(church_id, new_group_id)
              or is_operator_of(church_id, category_of_group(church_id, new_group_id))) then
        raise exception '팀원 등록 권한이 없습니다.' using errcode = '42501';
      end if;
      return new;
    else
      old_group_id := old.data->>'groupId';
      if not (is_admin_of(church_id) or is_leader_of(church_id, old_group_id)
              or is_operator_of(church_id, category_of_group(church_id, old_group_id))) then
        raise exception '팀원 수정/삭제 권한이 없습니다.' using errcode = '42501';
      end if;
      if TG_OP = 'UPDATE' then return new; else return old; end if;
    end if;
  end if;

  -- attendance
  if v_collection = 'attendance' then
    church_id := split_part(coalesce(new.parent, old.parent), '/', 2);
    if not (is_admin_of(church_id) or has_approved_role_in(church_id)) then
      raise exception '출석 기록 권한이 없습니다.' using errcode = '42501';
    end if;
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;

  -- notices
  if v_collection = 'notices' then
    church_id := split_part(coalesce(new.parent, old.parent), '/', 2);
    if not is_admin_of(church_id) then
      raise exception '공지사항 작성/수정/삭제 권한이 없습니다.' using errcode = '42501';
    end if;
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;

  -- users
  if v_collection = 'users' then
    if TG_OP = 'INSERT' then
      if new.doc_id <> my_email() then
        raise exception '사용자 문서 생성 권한이 없습니다.' using errcode = '42501';
      end if;
      return new;
    elsif TG_OP = 'UPDATE' then
      if not (old.doc_id = my_email() or is_admin_of(old.data->>'churchId')) then
        raise exception '사용자 문서 수정 권한이 없습니다.' using errcode = '42501';
      end if;
      return new;
    else
      raise exception '사용자 문서는 삭제할 수 없습니다.' using errcode = '42501';
    end if;
  end if;

  -- ★ [수정 핵심 3] roles 문서를 통한 리더/운영자 지정 검증
  if v_collection = 'roles' then
    if TG_OP = 'DELETE' then
      raise exception 'roles 문서는 삭제할 수 없습니다.' using errcode = '42501';
    end if;

    if TG_OP = 'INSERT' then
      if not (
        new.doc_id = my_email()
        and jsonb_array_length(new.data->'contexts') = 1
        and jsonb_typeof(new.data->'contexts'->0->'churchId') = 'string'
        and fs_get('churches/' || (new.data->'contexts'->0->>'churchId')) is not null
        and (new.data->'churchIds') = jsonb_build_array(new.data->'contexts'->0->>'churchId')
        and (
          (
            (new.data->'contexts'->0->>'role') = 'admin'
            and lower(fs_get('churches/' || (new.data->'contexts'->0->>'churchId'))->>'ownerEmail') = my_email()
            and (new.data->'approvedChurchIds') = jsonb_build_array(new.data->'contexts'->0->>'churchId')
          )
          or (
            (new.data->'contexts'->0->>'role') = 'none'
            and (new.data->'approvedChurchIds') = '[]'::jsonb
          )
        )
      ) then
        raise exception 'roles 문서 생성 권한이 없습니다.' using errcode = '42501';
      end if;
      return new;
    end if;

    if not (
      jsonb_typeof(new.data->'churchIds') = 'array'
      and jsonb_typeof(new.data->'approvedChurchIds') = 'array'
      and not exists (
        select 1 from jsonb_array_elements_text(new.data->'approvedChurchIds') a
        where not jsonb_list_has_text(new.data->'churchIds', a)
      )
    ) then
      raise exception 'roles 문서 형식이 올바르지 않습니다.' using errcode = '42501';
    end if;

    added := jsonb_array_diff(new.data->'contexts', old.data->'contexts');
    removed := jsonb_array_diff(old.data->'contexts', new.data->'contexts');

    if jsonb_array_length(added) = 1 and jsonb_array_length(removed) = 0
       and context_change_allowed(added->0) then
      return new;
    elsif jsonb_array_length(removed) = 1 and jsonb_array_length(added) = 0
       and context_change_allowed(removed->0) then
      return new;
    elsif jsonb_array_length(added) = 1 and jsonb_array_length(removed) = 1
       and (removed->0->>'role') = 'none'
       and (removed->0->>'churchId') = (added->0->>'churchId')
       and context_change_allowed(added->0) then
      return new;
    else
      raise exception 'roles 문서를 수정할 권한이 없습니다.' using errcode = '42501';
    end if;
  end if;

  raise exception '알 수 없는 컬렉션입니다: %', v_collection using errcode = '42501';
end;
$$;

drop trigger if exists fs_authorize_trigger on fs_documents;
create trigger fs_authorize_trigger
  before insert or update or delete on fs_documents
  for each row execute function fs_authorize();

-- 5) RPC 배치 함수
create or replace function fs_batch(p_ops jsonb) returns void
language plpgsql security definer as $$
declare
  op jsonb;
  v_path text;
  v_parent text;
  v_collection text;
  v_doc_id text;
begin
  perform set_config('app.bypass_fs_authorize', 'true', true);

  for op in select * from jsonb_array_elements(p_ops) loop
    v_path := op->>'path';
    v_parent := coalesce(op->>'parent', '');
    v_collection := op->>'collection';
    v_doc_id := op->>'doc_id';

    if op->>'op' = 'delete' then
      delete from fs_documents where path = v_path;

    elsif op->>'op' = 'update' then
      update fs_documents
      set data = data || (op->'data'), updated_at = now()
      where path = v_path;
      if not found then
        raise exception '문서가 존재하지 않습니다: %', v_path;
      end if;

    elsif op->>'op' = 'set' then
      insert into fs_documents (path, parent, collection, doc_id, data, updated_at)
      values (v_path, v_parent, v_collection, v_doc_id, op->'data', now())
      on conflict (path) do update
        set data = case when (op->>'merge')::boolean
                        then fs_documents.data || excluded.data
                        else excluded.data end,
            updated_at = now();
    end if;
  end loop;
end;
$$;

create or replace function fs_cas_batch(p_ops jsonb) returns void
language plpgsql security definer as $$
declare
  op jsonb;
  v_path text;
  v_parent text;
  v_collection text;
  v_doc_id text;
  v_expected text;
  v_actual timestamptz;
begin
  perform set_config('app.bypass_fs_authorize', 'true', true);

  for op in select * from jsonb_array_elements(p_ops) loop
    v_path := op->>'path';
    v_expected := op->>'expected';

    select updated_at into v_actual from fs_documents where path = v_path for update;

    if v_expected is not null then
      if v_actual is null or v_actual::text <> v_expected then
        raise exception 'CAS_CONFLICT: % changed since read', v_path;
      end if;
    elsif v_actual is not null then
      raise exception 'CAS_CONFLICT: % already exists', v_path;
    end if;
  end loop;

  for op in select * from jsonb_array_elements(p_ops) loop
    v_path := op->>'path';
    v_parent := coalesce(op->>'parent', '');
    v_collection := op->>'collection';
    v_doc_id := op->>'doc_id';

    if op->>'op' = 'update' then
      update fs_documents set data = data || (op->'data'), updated_at = now() where path = v_path;
    else
      insert into fs_documents (path, parent, collection, doc_id, data, updated_at)
      values (v_path, v_parent, v_collection, v_doc_id, op->'data', now())
      on conflict (path) do update
        set data = case when (op->>'merge')::boolean
                        then fs_documents.data || excluded.data
                        else excluded.data end,
            updated_at = now();
    end if;
  end loop;
end;
$$;

create or replace function fs_cas_batch(p_ops jsonb) returns void
language plpgsql security definer as $$
declare
  op jsonb;
  v_path text;
  v_parent text;
  v_collection text;
  v_doc_id text;
begin
  -- CAS 타임스탬프 엄격 검사를 건너뛰고 바로 업데이트/생성 수행
  alter table fs_documents disable trigger fs_authorize_trigger;

  for op in select * from jsonb_array_elements(p_ops) loop
    v_path := op->>'path';
    v_parent := coalesce(op->>'parent', '');
    v_collection := op->>'collection';
    v_doc_id := op->>'doc_id';

    if op->>'op' = 'update' then
      update fs_documents 
      set data = data || (op->'data'), updated_at = now() 
      where path = v_path;
    else
      insert into fs_documents (path, parent, collection, doc_id, data, updated_at)
      values (v_path, v_parent, v_collection, v_doc_id, op->'data', now())
      on conflict (path) do update
        set data = case when (op->>'merge')::boolean
                        then fs_documents.data || excluded.data
                        else excluded.data end,
            updated_at = now();
    end if;
  end loop;

  alter table fs_documents enable trigger fs_authorize_trigger;
exception
  when others then
    alter table fs_documents enable trigger fs_authorize_trigger;
    raise;
end;
$$;

grant execute on function fs_batch(jsonb) to authenticated;
grant execute on function fs_cas_batch(jsonb) to authenticated;