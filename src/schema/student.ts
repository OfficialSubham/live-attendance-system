import dotenv from "dotenv";
import mongoose, { model, Schema } from "mongoose";

dotenv.config();

enum ROLE {
  teacher,
  student,
}

const URL = process.env.MONGO_URL || "";

mongoose.connect(URL);

export const UserSchema = new Schema({
  name: String,
  email: String,
  password: String,
  role: ROLE,
});

export const User = model("user", UserSchema);
