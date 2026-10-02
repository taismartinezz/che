export type CityCode = 'mvd' | 'bue';
export type CategoryId = 'tech' | 'clases' | 'mudanza' | 'hogar' | 'objetos' | 'mascotas' | 'cuidado';

export const CITIES: { id: CityCode; neighbourhoods: string[] }[] = [
  {
    id: 'mvd',
    neighbourhoods: ['Cordón', 'Pocitos', 'Parque Rodó', 'Malvín', 'Centro', 'Ciudad Vieja', 'Punta Carretas', 'Buceo', 'Prado', 'Otro'],
  },
  {
    id: 'bue',
    neighbourhoods: ['Almagro', 'Palermo', 'Villa Crespo', 'Caballito', 'San Telmo', 'Recoleta', 'Belgrano', 'Boedo', 'Colegiales', 'Otro'],
  },
];

export const neighbourhoodsFor = (city: CityCode | null | undefined) =>
  CITIES.find((c) => c.id === city)?.neighbourhoods ?? [];

export const CATEGORIES: { id: CategoryId; sensitive?: boolean }[] = [
  { id: 'tech' },
  { id: 'clases' },
  { id: 'mudanza' },
  { id: 'hogar' },
  { id: 'objetos' },
  { id: 'mascotas' },
  { id: 'cuidado', sensitive: true },
];

export const SENSITIVE_CATEGORIES: CategoryId[] = ['cuidado'];
export const isSensitive = (c: string) => SENSITIVE_CATEGORIES.includes(c as CategoryId);

export const MAX_REQUEST_LENGTH = 280;

/** Columns of `profiles` that signed-in users may read (contact_whatsapp is never one of them). */
export const PROFILE_COLUMNS =
  'id, display_name, avatar_url, city, neighbourhood, bio, skills, verification_status, background_checked, is_registered_worker, invite_code, onboarded, created_at';
export const PROFILE_MINI = 'id, display_name, avatar_url, neighbourhood';

/** Features that are visible but not built yet. Each opens the coming-soon dialog. */
export type SoonFeature =
  | 'payments'
  | 'registered_worker'
  | 'invoices';

export const SOON_STAGE: Record<SoonFeature, 'mvp' | 'stage2' | 'stage3'> = {
  payments: 'stage2',
  registered_worker: 'stage2',
  invoices: 'stage3',
};
