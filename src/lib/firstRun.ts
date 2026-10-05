// Small session flags for the first-run flow.
export const NEXT_KEY = 'che-next';
export const WELCOME_KEY = 'che-welcome';

const get = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export const rememberNextPath = (path: string) => set(NEXT_KEY, path);
/** Returns (and forgets) a deep link remembered before sign-in. */
export const takeNextPath = () => {
  const v = get(NEXT_KEY);
  set(NEXT_KEY, null);
  return v;
};

export const markWelcomePending = () => set(WELCOME_KEY, '1');
export const isWelcomePending = () => get(WELCOME_KEY) === '1';
export const clearWelcomePending = () => set(WELCOME_KEY, null);
