import { config as loadEnv } from "dotenv";
import path from "path";

// 集成测试统一加载 .env.test，确保 DATABASE_URL 指向独立的测试库
loadEnv({ path: path.resolve(process.cwd(), ".env.test") });
