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
  token: string;
};

let activeSession: Session | null = null;

const SECRET = process.env.JWT_SECRET || "";
const PORT = 3000;
const SALT = 10;
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
        _id: newUser._id,
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
        error: "Invalid email or password",
      });
    const user = await User.findOne({
      email,
    });
    const validPassword = await compare(password, user?.password || "");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }
    if (!validPassword)
      return res.status(400).json({
        success: false,
        error: "Invalid email or password",
      });

    const token = sign(
      { _id: user._id, name: user.name, email: user.email, role: user.role },
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
  const { token } = req.headers as Header;
  try {
    const user = verify(token, SECRET) as {
      _id: string;
      name: string;
      email: string;
      role: "student" | "teacher";
    };
    if (!user || !token)
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
  const { token } = req.headers as Header;
  const { className } = req.body;
  try {
    const user = verify(token, SECRET) as UserType;

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
        error: "Invalid",
      });
    const newClass = await Classes.create({
      className,
      studentIds: [],
      teacherId: new mongoose.Types.ObjectId(user._id),
    });
    res.status(201).json({
      success: true,
      data: {
        _id: newClass._id,
        className,
        teacherId: user._id,
        studentIds: [],
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Unauthorized token missing or invalid",
    });
  }
});

app.post("/class/:id/add-student", async (req, res) => {
  const { id } = req.params;
  const { token } = req.headers as Header;
  const { studentId } = req.body;
  // const convertedId = new mongoose.Types.ObjectId(id);
  try {
    const user = verify(token, SECRET) as UserType; //Check wrong token gives error or not
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
        .json({ success: false, error: "Please enter valid student id" });
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
      data: result,
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
  const { token } = req.headers as Header;

  try {
    const userDetail = verify(token, SECRET) as UserType;
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
      return res.status(400).json({
        success: false,
        error: "You are not creater or added in this class",
      });
    res.json({
      success: true,
      data: {
        _id: data._id,
        className: data.className,
        teacherId: data.teacherId,
        students: data.studentIds,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ success: false, error: "Invalid request" });
  }
});

app.get("/students", async (req, res) => {
  const { token } = req.headers as Header;
  try {
    const userDetails = verify(token, SECRET) as UserType;
    if (userDetails.role != "teacher")
      return res
        .status(400)
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
    res
      .status(400)
      .json({ success: false, error: "Unauthorized token missing or invalid" });
  }
});

app.get("/class/:id/my-attendence", async (req, res) => {
  const { id } = req.params;
  const { token } = req.headers as Header;

  try {
    const userDetails = verify(token, SECRET) as UserType;
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
  const { token } = req.headers as Header;
  const { classId } = req.body;
  try {
    const userDetails = verify(token, SECRET) as UserType;
    if (!isValidObjectId(classId) || userDetails.role != "teacher")
      return res.status(400).json({
        success: false,
        error: "Forbidden, you need teacher access",
      });

    const classOwner = await Classes.findOne({
      _id: classId,
      teacherId: userDetails._id,
    });

    if (!classOwner)
      return res.status(400).json({
        success: false,
        error: "Forbidden, you don't have access to this class",
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
    res.status(400).json({
      success: false,
      error: "Unauthorized token missing or invalid",
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server is listening in port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: CustomWebSocket, req) => {
  ws.on("error", (e) => {
    // console.log(e);
    ws.send("Closing");
  });
  //Extracting token
  const url = req.url || "";
  const tokenQuery = URL.parse(url).query;
  const splitToken = tokenQuery?.split("=");
  const token = splitToken ? splitToken[1] : "";

  try {
    const userDetails = verify(token, SECRET) as UserType;

    ws.userId = userDetails._id;
    ws.role = userDetails.role;
    ws.on("close", (code) => {
      ws.send("Normal closure");
    });

    ws.on("message", (data) => {
      wss.clients.forEach((client) => {
        if (client.readyState == WebSocket.OPEN) {
          client.send(data, { binary: false });
        }
      });
    });

    ws.send("Hello");
  } catch (error) {
    console.log(error);
    ws.close(
      1000,
      JSON.stringify({
        event: "ERROR",
        data: { message: "Unauthorized or invalid token" },
      })
    );
  }
});
