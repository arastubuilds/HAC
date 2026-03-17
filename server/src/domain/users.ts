export type User = {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
};

export type Account = {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string | null;
  passwordHash: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  createdAt: Date;
};

export type CreateUserInput = {
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  password: string;
};
