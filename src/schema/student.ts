import dotenv from "dotenv";
import mongoose, { Schema } from "mongoose";

dotenv.config();

enum ROLE {
  teacher,
  student,
}

const URL = process.env.MONGO_URL || "";

mongoose.connect(URL);

export const Student = new Schema({
  name: String,
  email: String,
  password: String,
  role: ROLE,
});
