import express from "express";
import { WebSocketServer } from "ws";
import { User, UserZodSchema } from "./schema/student";
import { hash } from "bcryptjs";
import { sign } from "jsonwebtoken";

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
      data: newUser,
    });
  } catch (error) {
    console.log("Error \n", error);
    res.status(500).send("Internal server error");
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server is listening in port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("error", console.error);
});
