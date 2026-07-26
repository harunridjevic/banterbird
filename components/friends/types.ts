export type FriendProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export type FriendEntry = {
  friend_id: string;
  profiles: FriendProfile;
};

export type IncomingRequest = {
  id: string;
  from_id: string;
  created_at: string;
  profiles: FriendProfile;
};

export type DmMessage = {
  id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};
