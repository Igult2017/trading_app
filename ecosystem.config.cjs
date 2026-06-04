module.exports = {
  apps: [
    {
      name: "myfmjournal",
      script: "dist/index.js",
      instances: "max",    // one worker per CPU core
      exec_mode: "cluster", // PM2 cluster mode — shares port across workers
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",

      // Pull the current shell environment into PM2 on every start/restart.
      // This means env vars set in Hostinger's control panel will always be
      // picked up — no .env file needed on the server.
      env: process.env,
    },
  ],
};
