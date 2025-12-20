import { Schema } from "mongoose";

enum Status {
  present,
  absent,
}

export const Class = new Schema({
  className: String,
  teacherId: Schema.Types.ObjectId,
  studentIds: [Schema.Types.ObjectId],
});

export const Attendence = new Schema({
  classId: Schema.Types.ObjectId,
  studentId: Schema.Types.ObjectId,
  status: Status,
});
