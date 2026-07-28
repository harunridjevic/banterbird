-- ============================================================
-- BanterBird — leave_active_room RPC
-- Removes one participant from a room without ending it for the other.
-- Used when shouldAcceptRoom rejects a blocked match to prevent re-match loops.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

create or replace function public.leave_active_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then return; end if;
  if v_room.ended_at is not null then return; end if;

  if v_room.user_a = v_me then
    -- Swap: make user_b the new user_a so the room stays alive
    if v_room.user_b is not null then
      update public.rooms
      set user_a = v_room.user_b,
          user_b = null,
          user_a_gender = v_room.user_b_gender,
          user_b_gender = null
      where id = p_room_id;
    else
      -- Room had no second user anyway — end it
      update public.rooms set ended_at = now() where id = p_room_id;
    end if;
  elsif v_room.user_b = v_me then
    -- Just clear user_b slot
    update public.rooms
    set user_b = null, user_b_gender = null
    where id = p_room_id;
  end if;
end;
$$;
