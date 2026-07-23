-- =========================================================
-- 마이그레이션: 팀원별 기도제목 기능 추가
-- =========================================================
-- supabase-schema.sql, supabase-migration-multi-admin.sql을 이미
-- 실행하신 상태라면, 전체를 다시 돌리지 말고 이 파일만 SQL Editor에서
-- 실행하세요. (기존 fs_authorize/context_change_allowed/RLS 정책을
-- 안전하게 다시 정의하며, 그 김에 공동 운영자 마이그레이션 때 빠졌던
-- app.bypass_fs_authorize 배치 우회 체크도 함께 복원합니다 - 이 체크가
-- 빠지면 회원가입/권한위임 등에서 쓰는 배치 쓰기(fs_batch)가 오작동할
-- 수 있습니다)

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
  elsif v_role = 'admin' then
    /* [신규] 공동 운영자 지정/해제 - 기존 운영자만 다른 사람을 운영자로
       추가하거나 뺄 수 있음 */
    return is_admin_of(v_church_id);
  else
    return false;
  end if;
end;
$$;

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

  -- [신규] prayers (팀원별 기도제목 - 팀장/그룹장/운영자가 작성, members와 동일한 권한 체계)
  if v_collection = 'prayers' then
    church_id := split_part(coalesce(new.parent, old.parent), '/', 2);
    if TG_OP = 'INSERT' then
      new_group_id := new.data->>'groupId';
      if not (is_admin_of(church_id) or is_leader_of(church_id, new_group_id)
              or is_operator_of(church_id, category_of_group(church_id, new_group_id))) then
        raise exception '기도제목 등록 권한이 없습니다.' using errcode = '42501';
      end if;
      return new;
    else
      old_group_id := old.data->>'groupId';
      if not (is_admin_of(church_id) or is_leader_of(church_id, old_group_id)
              or is_operator_of(church_id, category_of_group(church_id, old_group_id))) then
        raise exception '기도제목 수정/삭제 권한이 없습니다.' using errcode = '42501';
      end if;
      if TG_OP = 'UPDATE' then return new; else return old; end if;
    end if;
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

    /* [신규] 개설자(교회 문서의 ownerEmail)의 admin 컨텍스트는 어떤 경우에도
       제거할 수 없음 - 실수로 운영자가 0명이 되는 것을 방지 */
    if exists (
      select 1 from jsonb_array_elements(removed) r
      where r->>'role' = 'admin'
        and lower(fs_get('churches/' || (r->>'churchId'))->>'ownerEmail') = new.doc_id
    ) then
      raise exception '교회를 처음 만든 운영자는 제외할 수 없습니다.' using errcode = '42501';
    end if;

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
    when 'prayers'    then my_email() <> ''
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
