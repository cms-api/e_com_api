import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";

import path from "path";

dotenv.config();
const app = express();
const Port = process.env.PORT || 8000;
const __dirname = path.resolve();
//middleware
app.use(cors());
app.use(morgan());
app.use(express.json());
//converting public folder to static serving folder
app.use(express.static(path.join(__dirname, "/src/public")));
console.log(__dirname);

//database connection
import mongoConnect from "./src/config/mongoConfig.js";
mongoConnect();
//router API
import userRouter from "./src/router/userRouter.js";

app.use("/api/v1/user", userRouter);
import categoryRouter from "./src/router/categoryRouter.js";
import { auth } from "./src/middleware/authMiddleware.js";
app.use("/api/v1/category", auth, categoryRouter);
//payment router
import paymentRouter from "./src/router/paymentRouter.js";
app.use("/api/v1/payment", auth, paymentRouter);

import product from "./src/router/productRouter.js";
app.use("/api/v1/product", auth, product);

//api default
app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "server is running",
  });
});

app.use((error, req, res, next) => {
  const code = error.statusCode || 500;
  res.status(code).json({
    status: "error",
    message: error.message,
  });
});

app.listen(Port, (err) => {
  err
    ? console.log(err.message)
    : console.log(`server is running at port ${Port}`);
});
