import express from "express";
import { PORT } from "./env.js";
import { pool } from "./db.js";
import { countryRoute } from "./router/country.router.js";
const app = express();
app.use(express.json());
app.use("/", countryRoute);
app.listen(PORT, (req, res) => {
  console.log("App running");
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("DB connection error:", err);
      return;
    }
    console.log("DB connected");
    connection.release();
  });
});
