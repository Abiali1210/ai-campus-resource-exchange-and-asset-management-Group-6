import { createFoundationHandler } from './handler.ts';

const get = (name: string) => Deno.env.get(name);
Deno.serve(createFoundationHandler({
  supabaseUrl: get('SUPABASE_URL') ?? '',
  anonKey: get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: get('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins: (get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(origin => origin.trim()).filter(Boolean),
}));
