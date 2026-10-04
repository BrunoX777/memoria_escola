/* App state — shared across modules */
export const S = {
  token: localStorage.getItem('me_token'),
  user: JSON.parse(localStorage.getItem('me_user') || 'null'),
  db: null,
  anoTL: 2026
};

export function resetState() {
  S.token = null;
  S.user = null;
  S.db = null;
  S.anoTL = 2026;
}
