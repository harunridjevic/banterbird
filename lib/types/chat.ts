export type SelfGender = "male" | "female";
export type WantsGender = "male" | "female" | "any";

export type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export type RoomRow = {
  id: string;
  user_a: string;
  user_b: string;
  user_a_gender: SelfGender | null;
  user_b_gender: SelfGender | null;
  ended_at: string | null;
  created_at: string;
};
