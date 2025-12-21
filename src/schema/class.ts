import { Schema, model } from "mongoose";
import z from "zod";

enum Status {
  present,
  absent,
}

export const ClassZodSchema = z.object({
  className: z.string(),
});

export const ClassSchema = new Schema({
  className: String,
  teacherId: Schema.Types.ObjectId,
  studentIds: [Schema.Types.ObjectId],
});

export const AttendanceSchema = new Schema({
  classId: Schema.Types.ObjectId,
  studentId: Schema.Types.ObjectId,
  status: ["present", "absent"],
});

export const Classes = model("class", ClassSchema);
export const Attendance = model("attendance", AttendanceSchema);
