import mongoose, { Schema, model } from "mongoose";
import z, { string } from "zod";

enum Status {
  present,
  absent,
}

export const ClassZodSchema = z.object({
  className: z.string(),
});

export const ClassSchema = new Schema({
  className: String,
  teacherId: { type: mongoose.Types.ObjectId, ref: "user" },
  studentIds: { type: [mongoose.Types.ObjectId], ref: "user" },
});

export const AttendanceSchema = new Schema({
  classId: mongoose.Types.ObjectId,
  studentId: { type: mongoose.Types.ObjectId, ref: "user" },
  status: String,
});

export const Classes = model("class", ClassSchema);
export const Attendance = model("attendance", AttendanceSchema);
