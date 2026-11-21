import { createCoachHandler } from '../_shared/http.js';
Deno.serve(createCoachHandler({ env: Deno.env.toObject() }));
