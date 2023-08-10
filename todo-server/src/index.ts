import express from "express";
import { Pool } from "pg";
import path from "path";
import { Server as SocketIOServer, Socket } from "socket.io";
import cors from "cors";
import * as http from "http";

const app = express();
const port = 3003;
const server = http.createServer(app);

// Use CORS middleware
app.use(cors());

app.use(
  "/socket.io",
  express.static(__dirname + "../../node_modules/socket.io-client/dist/"), // added this
);
const io = new SocketIOServer(server, {
  cors: {
    origin: "http://localhost:3000", // Replace with your React app's URL
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});
// Replace with your actual database URL
const pool = new Pool({
  connectionString:
    "postgres://postgres:postgres.islom_1228@localhost:5432/postgres",
});

app.use(express.json());

// Serve static files from the React build
app.use(express.static(path.join(__dirname, "client/build")));

// Add this code after creating the pool
(async () => {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS todo (
        id TEXT PRIMARY KEY,
        title TEXT,
        status TEXT
      );
    `);
    console.log("Todo table created");
  } finally {
    client.release();
  }
})();

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("subscribe", () => {
    socket.join("tasks");
    (async () => {
      const client = await pool.connect();
      let data;
      try {
        const result = await client.query("SELECT * FROM todo");

        data = JSON.stringify(result.rows);
      } finally {
        client.release();
      }
      socket.emit("loadingData", data);
    })();
  });

  // Add todo to database through socket
  socket.on("newTodo", async (data) => {
    console.log(data, "data");
    const { id, title, status } = data;
    const client = await pool.connect();
    try {
      await client
        .query(
          `INSERT INTO todo (id, title, status) VALUES ($1, $2, $3) RETURNING *`,
          [id, title, status],
        )
        .then((result) => {
          console.log(
            `Add todo with id ${id}. Result: ${JSON.stringify(result)}`,
          );
          socket.broadcast
            .to("tasks")
            .emit("newTodo", JSON.stringify(result.rows[0]));
        })
        .catch((error) => {
          console.log(`Error adding todo with id ${id}:`, error);
        });
    } finally {
      client.release();
    }
  });

  // Edit todo in database through socket
  socket.on("editedTodo", async ({ id, title, status }) => {
    console.log({ id, title, status }, "data");
    const client = await pool.connect();
    try {
      await client
        .query(
          `UPDATE todo SET title = $2, status = $3 WHERE id = $1 RETURNING *`,
          [id, title, status],
        )
        .then((result) => {
          console.log(
            `Editing todo with id ${id}. Result: ${JSON.stringify(result)}`,
          );
          socket.broadcast
            .to("tasks")
            .emit("editedTodo", JSON.stringify(result.rows[0]));
        })
        .catch((error) => {
          console.log(`Error editing todo with id ${id}:`, error);
        });
    } finally {
      client.release();
    }
  });

  // Delete todo from database through socket
  socket.on("deletedTodo", async (id) => {
    console.log("id", id);
    const client = await pool.connect();
    try {
      await client
        .query(`DELETE FROM todo WHERE id = $1`, [id])
        .then((result) => {
          console.log(
            `Deleted todo with id ${id}. Result: ${JSON.stringify(result)}`,
          );
          socket.broadcast.to("tasks").emit("deletedTodo", id);
        })
        .catch((error) => {
          console.log(`Error deleting todo with id ${id}:`, error);
        });
    } finally {
      client.release();
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
