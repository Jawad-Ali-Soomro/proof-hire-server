import { z } from 'zod';

export const NewUser = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(3),
  role: z.enum(['ADMIN', 'FREELANCER', 'CLIENT']).default('FREELANCER'),
});