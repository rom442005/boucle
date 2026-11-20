/*
 * Serveur de la communauté (Supabase). L'adresse du projet et sa clé publique (« anon ») sont faites pour
 * être dans l'app : la sécurité tient aux règles d'accès de la base (supabase/schema.sql).
 * Tant qu'elles sont vides, la Communauté s'annonce « bientôt » ; ?demo=communaute ouvre une démonstration
 * sur l'appareil.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const communityConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
