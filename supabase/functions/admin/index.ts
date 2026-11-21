import { createAdminHandler } from '../_shared/http.js';
Deno.serve(createAdminHandler({ env: Deno.env.toObject() }));
