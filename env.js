import { config } from "dotenv";
config({ path: `.env.${process.env.NODE_ENV || "production"}.local` });
export const { PORT, DB_USER, DB_PASSWORD, DB, DB_HOST, DB_PORT } = process.env;
