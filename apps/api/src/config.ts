import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1), PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  PRIVY_APP_ID: z.string().default("demo-app"), PRIVY_APP_SECRET: z.string().default("demo-secret"),
  PRIVY_VERIFICATION_KEY: z.string().optional(), STARTING_BALANCE: z.coerce.number().positive().default(10000),
  ALLOW_DEMO_AUTH: z.enum(["true", "false"]).default("false").transform(v => v === "true")
});
export const config = schema.parse(process.env);
