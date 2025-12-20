import dotenv from "dotenv";
import z, { email } from "zod";
import mongoose, { model, Schema } from "mongoose";

dotenv.config();

enum ROLE {
  teacher,
  student,
}

const URL = process.env.MONGO_URL || "";

mongoose.connect(URL);

export const UserZodSchema = z
  .object({
    name: z.string(),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(["student", "teacher"]),
  })
  .strict();

export const UserLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const UserSchema = new Schema({
  name: String,
  email: String,
  password: String,
  role: {
    type: String,
    enum: ROLE,
  },
});

export const User = model("user", UserSchema);
