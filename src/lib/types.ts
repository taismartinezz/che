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

export const REQUEST_COLUMNS = `id, author_id, category, text, city, neighbourhood, status, is_example, created_at,
  author:profiles!requests_author_id_fkey(id, display_name, avatar_url, neighbourhood),
  offers(count)`;
