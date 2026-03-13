import { z } from "zod";

export const RegisterDTO = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const LoginDTO = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type AuthResponse = {
  token: string;
  user: { id: string; email: string; createdAt: string };
};
