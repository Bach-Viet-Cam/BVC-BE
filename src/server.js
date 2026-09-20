import app from './app.js';
import envConfig from './config/EnvConfig.js';

function startServer() {
  app.listen(envConfig.port, () => {
    console.log(`Server is running on port ${envConfig.port}`);
  });
}

startServer();
