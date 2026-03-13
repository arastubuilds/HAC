export type User = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export type CreateUserInput = {
  email: string;
  password: string;
};
