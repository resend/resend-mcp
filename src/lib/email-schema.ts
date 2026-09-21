import { z } from 'zod';

export const email = z.email({ pattern: z.regexes.html5Email });
