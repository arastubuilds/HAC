import { z } from "zod";

export const RegisterDTO = z.object({
  email: z.email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  password: z.string().min(8),
});

export const LoginDTO = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: string;
  };
};
