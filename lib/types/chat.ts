export type SelfGender = "male" | "female";
export type WantsGender = "male" | "female" | "any";

export type MessageRow = {
  id: string;
  room_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  is_from_ai?: boolean;
  /** Stable React key — survives optimistic → server id swap without re-animating. */
  clientKey?: string;
};

export type RoomRow = {
  id: string;
  user_a: string;
  user_b: string | null;
  user_a_gender: SelfGender | null;
  user_b_gender: SelfGender | null;
  is_ai_room?: boolean;
  bot_gender: SelfGender | null;
  ended_at: string | null;
  created_at: string;
};
