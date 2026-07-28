import dotenv from 'dotenv';
import { buildApp } from './app';

dotenv.config();

const app = buildApp();

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 API Server running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
