import type { CategoryId, CityCode } from './constants';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  city: CityCode | null;
  neighbourhood: string | null;
  bio: string | null;
  skills: CategoryId[];
  verification_status: 'none' | 'pending' | 'verified';
  background_checked: boolean;
  is_registered_worker: boolean;
  invite_code: string;
  onboarded: boolean;
  created_at: string;
}

export type MiniProfile = Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'neighbourhood'>;

export interface RequestRow {
  id: string;
  author_id: string;
  category: CategoryId;
  text: string;
  city: CityCode;
  neighbourhood: string | null;
  status: 'open' | 'resolved' | 'closed';
  is_example: boolean;
  created_at: string;
  group_id: string | null;
  group: { id: string; name: string } | null;
  author: MiniProfile | null;
  offers: { count: number }[];
}

export interface Recommendation {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  neighbourhood: string | null;
  score: number;
  distance: number | null;
  mutual_count: number;
  via_id: string | null;
  via_name: string | null;
  exchange_count: number;
  endorsement_count: number;
  shares_group: boolean;
  same_neighbourhood: boolean;
  is_verified: boolean;
  reasons: string[];
}

export interface IntroRequest {
  id: string;
  request_id: string;
  requester_id: string;
  target_id: string;
  via_id: string | null;
  status: 'pending' | 'accepted' | 'declined';
  target_status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface Connection {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, string | null | undefined>;
  read_at: string | null;
  created_at: string;
}

export const REQUEST_COLUMNS = `id, author_id, category, text, city, neighbourhood, status, is_example, created_at, group_id,
  group:groups(id, name),
  author:profiles!requests_author_id_fkey(id, display_name, avatar_url, neighbourhood),
  offers(count)`;

export interface Conversation {
  other_id: string;
  display_name: string;
  avatar_url: string | null;
  last_body: string;
  last_at: string;
  last_from_me: boolean;
  unread: number;
  can_reply: boolean;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  neighbourhood: string | null;
  description: string | null;
  created_by: string | null;
  member_count: number;
  is_member: boolean;
  friends_in_group: number;
}
