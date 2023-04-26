require("colors");
require("dotenv").config();

const http = require("http");
const cors = require("cors");
const express = require("express");
const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.PRODCTION_CORS_ORIGIN
        : process.env.DEVELOPMENT_CORS_ORIGIN,
  })
);
app.use(require("helmet")());
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ msg: "Hello" });
});

app.use("/api/user", require("./routes/user"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/message", require("./routes/message"));

const { errorHandler } = require("./middlewares/error");
app.use(errorHandler);

const connectDB = require("./config/db");
connectDB(() => {
  const port = process.env.PORT || 5000;
  server.listen(port, () => {
    console.log(`Server running on port ${port}`.cyan.underline);
  });

  const io = require("./socket").init(server);
  const User = require("./models/user");

  // create a map to store user IDs for each socket
  const socketUserMap = new Map();

  io.on("connection", (socket) => {
    // console.log(`Connected id: ${socket.id}`.green.italic);
    socket.on("setup", async (id) => {
      socket.join(id);
      // console.log(`${socket.id} join to room ${id}`);

      // store user ID in socketUserMap
      socketUserMap.set(socket.id, id);

      try {
        await User.findOneAndUpdate(
          { _id: id },
          { isActive: true },
          { new: true }
        );
      } catch (error) {
        console.error(error);
      }
    });
    socket.on("join-chat", (chatId) => {
      socket.join(chatId);
    });
    socket.on("leave-chat", (chatId) => {
      socket.leave(chatId);
    });
    socket.on("start-typing", (chatId, user) => {
      socket.in(chatId).emit("started-typing", user);
    });
    socket.on("stop-typing", (chatId, userId) => {
      socket.in(chatId).emit("stopped-typing", userId);
    });
    socket.on("disconnect", async () => {
      // console.log(`Disconnected id: ${socket.id}`.red.italic);
      // get user ID from socketUserMap
      const userId = socketUserMap.get(socket.id);
      // remove socket ID and user ID from socketUserMap
      socketUserMap.delete(socket.id);

      try {
        await User.findOneAndUpdate(
          { _id: userId },
          { isActive: false },
          { new: true }
        );
      } catch (error) {
        console.error(error);
      }
    });
  });
});
