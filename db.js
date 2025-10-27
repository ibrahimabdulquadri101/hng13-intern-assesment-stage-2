import mysql from "mysql2";
import { DB_HOST, DB_USER, DB_PASSWORD, DB, DB_PORT } from "./env.js";
export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB,
});
