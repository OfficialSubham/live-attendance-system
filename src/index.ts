import express from "express";
import { WebSocketServer } from "ws";

const PORT = 3000;

const app = express();

const server = app.listen(PORT, () => {
  console.log(`Server is listening in port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("error", console.error);
});
