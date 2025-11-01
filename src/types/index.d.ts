import { Role } from "@prisma/client";
import { JwtPayload } from "jsonwebtoken";

export type TUserJwtPayload = JwtPayload & {
  email: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user: TUserJwtPayload;
    }
  }
}
