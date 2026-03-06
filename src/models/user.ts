export interface User {
  id: number;
  email: string;
  passwordHash: string;
  passwordResetTokenHash: string | null;
  passwordResetTokenExpiresAt: number | null;
  nickname: string | null;
  favouritesSyncTimestamp: number | null;
  historySyncTimestamp: number | null;
}

export interface UserInfo {
  id: number;
  email: string;
  nickname: string | null;
}

export interface AuthRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  reset_token: string;
  password: string;
}
