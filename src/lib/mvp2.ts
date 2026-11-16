/** This flag only exposes the experiment. Server authorization remains mandatory. */
export const mvp2Enabled = import.meta.env?.VITE_MVP2_ENABLED === 'true';
export type Agreement = {
  id: string; proposer_id: string; client_id: string; worker_id: string; task: string;
  scheduled_at: string; amount_minor: number; currency: 'UYU' | 'ARS';
  accepted_by: string[]; finished_by: string[];
  status: 'proposed' | 'confirmed' | 'completed';
  payment_state: 'unfunded' | 'simulated_held' | 'simulated_released';
  receipt: string | null; review: string | null;
  problem: 'none' | 'redo' | 'mediation' | 'closed';
  versions: Record<string, string>; share_token: string | null;
};
export function moneyToMinor(value: string): number {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw new Error('invalid_amount');
  const [whole, cents = ''] = value.split('.');
  const n = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  if (n <= 0) throw new Error('invalid_amount');
  return n;
}
