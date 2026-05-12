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
  ended_at: string | null;
  created_at: string;
};
