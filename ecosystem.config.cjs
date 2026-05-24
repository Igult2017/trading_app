module.exports = {
  apps: [
    {
      name: "myfmjournal",
      script: "dist/index.js",
      instances: 1,
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
