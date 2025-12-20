import { Schema, model } from "mongoose";

enum Status {
  present,
  absent,
}

export const ClassSchema = new Schema({
  className: String,
  teacherId: Schema.Types.ObjectId,
  studentIds: [Schema.Types.ObjectId],
});

export const AttendanceSchema = new Schema({
  classId: Schema.Types.ObjectId,
  studentId: Schema.Types.ObjectId,
  status: Status,
});

export const Classes = model("class", ClassSchema);
export const Attendance = model("attendance", AttendanceSchema);
