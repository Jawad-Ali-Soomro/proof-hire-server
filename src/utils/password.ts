import bcrypt from "bcryptjs"

export const encryptPassword = (password: string) => {
    return bcrypt.hash(password, 10)
}

export const comparePassword = (encrypted:string, password: string) => {
    return bcrypt.compare(password, encrypted)
}