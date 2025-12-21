import express from "express";
import { WebSocketServer } from "ws";
import { User, UserLoginSchema, UserZodSchema } from "./schema/student";
import { hash, compare } from "bcryptjs";
import { sign, verify } from "jsonwebtoken";
import { Classes, ClassZodSchema } from "./schema/class";

type UserType = {
  _id: string;
  name: string;
  email: string;
  role: "student" | "teacher";
};

type Header = {
  token: string;
};

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
    if (!user || !validPassword)
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

const server = app.listen(PORT, () => {
  console.log(`Server is listening in port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("error", console.error);
});
