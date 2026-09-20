import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import envConfig from './config/EnvConfig.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: envConfig.appOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

export default app;
