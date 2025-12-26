import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import {
  StudentIdSchema,
  User,
  UserLoginSchema,
  UserZodSchema,
} from "./schema/student";
import { hash, compare } from "bcryptjs";
import { sign, verify } from "jsonwebtoken";
import { Attendance, Classes, ClassZodSchema } from "./schema/class";
import mongoose, { isValidObjectId, ObjectId, Schema } from "mongoose";
import URL from "url";
import z from "zod";

interface CustomWebSocket extends WebSocket {
  userId?: string;
  role?: "teacher" | "student";
}

type UserType = {
  _id: string;
  name: string;
  email: string;
  role: "student" | "teacher";
};

type ClassType = {
  _id: Schema.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  studentIds: mongoose.Types.ObjectId[];
  className: string;
};

type Session = {
  classId: string;
  startedAt: string;
  attendance: {
    [key: string]: string;
  };
};

type Header = {
  authorization: string;
};

let activeSession: Session | null = null;

const SECRET = process.env.JWT_SECRET || "";
const PORT = 3000;
const SALT = 10;

const wsMessageSchema = z.object({
  event: z.string(),
  data: z.object({
    studentId: z.string().optional(),
    status: z.enum(["present", "absent"]).optional(),
  }),
});

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.send("Working fine");
});

app.post("/auth/signup", async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const { success, data, error } = UserZodSchema.safeParse({
      name,
      email,
      password,
      role,
    });

    if (!success)
      return res.status(400).json({
        success: false,
        error: "Invalid request schema",
      });

    const hashPassword = await hash(password, SALT);
    const userExisted = await User.findOne({
      email,
    });
    if (userExisted)
      return res.status(400).json({
        success: false,
        error: "Email already exists",
      });

    const newUser = await User.create({
      name: data.name,
      email: data.email,
      role: data.role,
      password: hashPassword,
    });

    res.status(201).json({
      success: true,
      data: {
        _id: newUser._id.toString(),
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.log("Error \n", error);
    res.status(500).send("Internal server error");
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { success } = UserLoginSchema.safeParse({
      email,
      password,
    });

    if (!success)
      return res.status(400).json({
        success: false,
        error: "Invalid request schema",
      });
    const user = await User.findOne({
      email,
    });
    const validPassword = await compare(password, user?.password || "");
    if (!user || !validPassword) {
      return res.status(400).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    const token = sign(
      {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
      SECRET
    );

    res.json({
      success: true,
      data: {
        token,
      },
    });
  } catch (error) {
    res.status(500).send("Internal server error");
  }
});

app.get("/auth/me", (req, res) => {
  const { authorization } = req.headers as Header;
  try {
    const user = verify(authorization, SECRET) as {
      _id: string;
      name: string;
      email: string;
      role: "student" | "teacher";
    };
    if (!user || !authorization)
      return res.status(400).json({
        success: false,
        error: "Unauthorized, token missing or invalid",
      });
    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Unauthorized, token missing or invalid",
    });
  }
});

app.post("/class", async (req, res) => {
  const { authorization } = req.headers as Header;
  const { className } = req.body;
  try {
    const user = verify(authorization, SECRET) as UserType;

    if (user.role != "teacher")
      return res.status(403).json({
        success: false,
        error: "Forbidden, teacher access required",
      });
    const { success } = ClassZodSchema.safeParse({
      className,
    });
    if (!success)
      return res.status(400).json({
        success: false,
        error: "Invalid request schema",
      });
    const newClass = await Classes.create({
      className,
      studentIds: [],
      teacherId: new mongoose.Types.ObjectId(user._id),
    });
    res.status(201).json({
      success: true,
      data: {
        _id: newClass._id.toString(),
        className,
        teacherId: user._id,
        studentIds: [],
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Unauthorized, token missing or invalid",
    });
  }
});

app.post("/class/:id/add-student", async (req, res) => {
  const { id } = req.params;
  const { authorization } = req.headers as Header;
  const { studentId } = req.body;
  // const convertedId = new mongoose.Types.ObjectId(id);
  try {
    const user = verify(authorization, SECRET) as UserType; //Check wrong token gives error or not
    if (user.role != "teacher")
      return res.status(403).json({
        success: false,
        error: "Forbidden, teacher access required",
      });
    const createdClass = (await Classes.findById(id)) as ClassType;
    if (!createdClass)
      return res.status(404).json({
        success: false,
        error: "Class not found",
      });
    if (!createdClass.teacherId.equals(user._id)) {
      return res.status(403).json({
        success: false,
        error: "Forbidden, not class teacher",
      });
    }

    const { success } = StudentIdSchema.safeParse({
      studentId,
    });
    if (!success)
      return res
        .status(400)
        .json({ success: false, error: "Invalid request schema" });

    const isStudentThere = createdClass.studentIds.find((s) => s == studentId);
    if (isStudentThere)
      return res.json({
        success: true,
        data: {
          id,
          className: createdClass?.className,
          teacherId: user._id,
          studentIds: createdClass?.studentIds,
        },
      });

    const isStudentExisted = await User.findById(studentId);
    if (!isStudentExisted)
      return res
        .status(404)
        .json({ success: false, error: "Student not found" });
    const result = await Classes.findOneAndUpdate(
      {
        _id: id,
      },
      {
        $push: {
          studentIds: new mongoose.Types.ObjectId(studentId),
        },
      },
      { new: true }
    );
    res.json({
      success: true,
      data: {
        id,
        className: result?.className,
        teacherId: user._id,
        studentIds: result?.studentIds,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(401).json({
      success: false,
      error: "Unauthorized, token missing or invalid",
    });
  }
});

app.get("/class/:id", async (req, res) => {
  const { id } = req.params;
  const { authorization } = req.headers as Header;

  try {
    const userDetail = verify(authorization, SECRET) as UserType;

    const isClassExisted = await Classes.findById(id);
    if (!isClassExisted)
      return res.status(404).json({ success: false, error: "Class not found" });

    const data = await Classes.findOne({
      _id: id,
      $or: [
        { teacherId: userDetail._id },
        {
          studentIds: {
            $in: userDetail._id,
          },
        },
      ],
    }).populate("studentIds", "-__v -password");
    if (!data)
      return res.status(403).json({
        success: false,
        error: "Forbidden, not class teacher",
      });
    res.json({
      success: true,
      data: {
        _id: data._id.toString(),
        className: data.className,
        teacherId: data.teacherId,
        students: data.studentIds,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(401).json({
      success: false,
      error: "Unauthorized, token missing or invalid",
    });
  }
});

app.get("/students", async (req, res) => {
  const { authorization } = req.headers as Header;
  try {
    const userDetails = verify(authorization, SECRET) as UserType;
    if (userDetails.role != "teacher")
      return res
        .status(403)
        .json({ success: false, error: "Forbidden, teacher access required" });
    const students = await User.find(
      {
        role: "student",
      },

      {
        password: false,
        __v: false,
        role: false,
      }
    );
    res.json({ success: true, data: students });
  } catch (error) {
    console.log(error);
    res.status(401).json({
      success: false,
      error: "Unauthorized, token missing or invalid",
    });
  }
});

app.get("/class/:id/my-attendance", async (req, res) => {
  const { id } = req.params;
  const { authorization } = req.headers as Header;

  try {
    const userDetails = verify(authorization, SECRET) as UserType;
    if (userDetails.role != "student")
      return res
        .status(400)
        .json({ success: false, error: "Forbidden, student access required" });

    const data = await Classes.findOne({
      _id: id,
      studentIds: {
        $in: userDetails._id,
      },
    });
    if (!data)
      return res.status(400).json({
        success: false,
        error: "Forbidden, you are not added to this class",
      });

    const wasPresent = await Attendance.findOne({
      classId: id,
      studentId: userDetails._id,
    });

    if (wasPresent)
      return res.json({
        success: true,
        data: {
          classId: wasPresent._id,
          status: wasPresent.status,
        },
      });
    return res.json({
      success: true,
      data: {
        classId: new mongoose.Types.ObjectId(id),
        status: null,
      },
    });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: "Unauthorized token missing or invalid" });
  }
});

app.post("/attendance/start", async (req, res) => {
  const { authorization } = req.headers as Header;
  const { classId } = req.body;
  try {
    const userDetails = verify(authorization, SECRET) as UserType;
    const { success } = ClassZodSchema.safeParse({ className: classId });
    if (!success)
      return res.status(400).json({
        success: false,
        error: "Invalid request schema",
      });
    if (userDetails.role != "teacher")
      return res.status(403).json({
        success: false,
        error: "Forbidden, teacher access required",
      });
    const isClassExisted = await Classes.findById(classId);
    if (!isClassExisted)
      return res.status(404).json({ success: false, error: "Class not found" });

    if (isClassExisted.teacherId?.toString() != userDetails._id)
      return res.status(403).json({
        success: false,
        error: "Forbidden, not class teacher",
      });

    const sessionStartTime = new Date().toISOString();
    activeSession = {
      classId,
      startedAt: sessionStartTime,
      attendance: {},
    };

    res.json({
      success: true,
      data: {
        classId,
        startedAt: sessionStartTime,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Unauthorized, token missing or invalid",
    });
  }
});

const server = app.listen(PORT);

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws: CustomWebSocket, req) => {
  ws.on("error", (e) => {
    console.log("Websocket ERROR", e);
    activeSession = null;
    ws.send("Closing");
  });

  ws.on("close", () => {
    activeSession = null;
  });
  const teacherQuery = ["ATTENDANCE_MARKED", "TODAY_SUMMARY", "DONE"];
  //Extracting token
  const url = req.url || "";
  const tokenQuery = URL.parse(url).query;
  const splitToken = tokenQuery?.split("=");
  const token = splitToken ? splitToken[1] : "";
  if (!url || url == "/") {
    ws.send(
      JSON.stringify({
        event: "ERROR",
        data: { message: "Unauthorized or invalid token" },
      })
    );
    ws.close();
  }
  try {
    const userDetails = verify(token, SECRET) as UserType;

    ws.userId = userDetails._id;
    ws.role = userDetails.role;

    ws.on("message", async (data) => {
      try {
        const messageData = JSON.parse(data.toString()) as {
          event:
            | "DONE"
            | "TODAY_SUMMARY"
            | "ATTENDANCE_MARKED"
            | "MY_ATTENDANCE";
          data?: {
            studentId: string;
            status: "present" | "absent";
          };
        };
        const { success, error } = wsMessageSchema.safeParse(messageData);
        if (!success) {
          console.log("MESSAGE DATA", messageData);
          console.log("SCHEMA ERROR", error);
          return ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Invalid request schema," },
            })
          );
        }
        if (teacherQuery.includes(messageData.event) && ws.role != "teacher")
          return ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Forbidden, teacher event only" },
            })
          );

        if (messageData.event == "MY_ATTENDANCE" && ws.role != "student")
          return ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Forbidden, student event only" },
            })
          );
        if (messageData.event == "MY_ATTENDANCE") {
          if (activeSession == null)
            return ws.send(
              JSON.stringify({
                event: "ERROR",
                data: { message: "No active attendance session" },
              })
            );
          ws.send(
            JSON.stringify({
              event: "MY_ATTENDANCE",
              data: {
                status: activeSession.attendance[ws.userId || ""]
                  ? activeSession.attendance[ws.userId || ""]
                  : "not yet updated",
              },
            })
          );
        } else if (messageData.event == "ATTENDANCE_MARKED") {
          if (activeSession == null)
            return ws.send(
              JSON.stringify({
                event: "ERROR",
                data: { message: "No active attendance session" },
              })
            );
          activeSession.attendance[messageData.data?.studentId || ""] =
            messageData.data?.status || "";
          wss.clients.forEach((client: CustomWebSocket) => {
            if (client.readyState == WebSocket.OPEN) {
              client.send(data, { binary: false });
            }
          });
        } else if (messageData.event == "TODAY_SUMMARY") {
          if (activeSession == null)
            return ws.send(
              JSON.stringify({
                event: "ERROR",
                data: { message: "No active attendance session" },
              })
            );
          let present = 0;
          let absent = 0;
          Object.keys(activeSession.attendance).forEach((key) => {
            const status = activeSession?.attendance[key];
            if (status == "present") present++;
            else absent++;
          });
          const total = present + absent;
          wss.clients.forEach((client) => {
            client.send(
              JSON.stringify({
                event: "TODAY_SUMMARY",
                data: { present, absent, total },
              })
            );
          });
        } else if (messageData.event == "DONE") {
          if (activeSession == null)
            return ws.send(
              JSON.stringify({
                event: "ERROR",
                data: { message: "No active attendance session" },
              })
            );
          let present = 0;
          let absent = 0;
          const allPromises: Promise<any>[] = [];
          Object.keys(activeSession.attendance).forEach((key) => {
            const status =
              activeSession?.attendance[key] == "present"
                ? "present"
                : "absent";
            if (status == "present") present++;
            else absent++;
            allPromises.push(
              Attendance.create({
                classId: activeSession?.classId,
                status,
                studentId: key,
              })
            );
          });
          await Promise.all(allPromises);
          const total = present + absent;
          activeSession = null;
          wss.clients.forEach((client) => {
            client.send(
              JSON.stringify({
                event: "DONE",
                data: {
                  message: "Attendance persisted",
                  present,
                  absent,
                  total,
                },
              })
            );
          });
        } else
          return ws.send(
            JSON.stringify({
              event: "ERROR",
              data: { message: "Unknown event" },
            })
          );
      } catch (error) {
        console.log(error);
        ws.send(
          JSON.stringify({
            event: "ERROR",
            data: { message: "Invalid message format" },
          })
        );
        ws.close();
      }
    });
  } catch (error) {
    console.log(error);
    ws.send(
      JSON.stringify({
        event: "ERROR",
        data: { message: "Unauthorized or invalid token" },
      })
    );
    ws.close();
  }
});
