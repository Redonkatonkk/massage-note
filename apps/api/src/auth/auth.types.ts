import type { User } from "@massage-note/database";
import type { Request } from "express";

export type AuthenticatedUser = User;

export type AuthenticatedRequest = Request & {
  currentUser?: AuthenticatedUser;
};
