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
  teacherId: mongoose.Types.ObjectId,
  studentIds: [mongoose.Types.ObjectId],
});

export const AttendanceSchema = new Schema({
  classId: mongoose.Types.ObjectId,
  studentId: mongoose.Types.ObjectId,
  status: ["present", "absent"],
});

export const Classes = model("class", ClassSchema);
export const Attendance = model("attendance", AttendanceSchema);
