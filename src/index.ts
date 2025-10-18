import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import routes from "./routes/index.js";
import connectDB from "./config/database.js";

const app = express();

const PORT = parseInt(process.env.PORT || "3000", 10);
const NODE_ENV = process.env.NODE_ENV || "development";

connectDB();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use("/api", routes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.path,
  });
});

app.use((err: any, req: Request, res: Response, next: any) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port: ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`)
});

export default app;
