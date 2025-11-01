import jwt, { JwtPayload, SignOptions } from "jsonwebtoken"

export const generateToken = (payload: any, secret: string, expiry: string) => {
    const token = jwt.sign(payload, secret, {
        expiresIn: expiry
    } as SignOptions)

    return token
}

export const verifyToken = (token: string, secret: string) => {
    const decodedToken = jwt.verify(token, secret)
    return decodedToken as JwtPayload
}