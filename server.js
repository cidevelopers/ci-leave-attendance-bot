require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { postWeeklySummary, postDailySummary, handleSlashCommand } = require('./leaveAttendance');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => {
  res.send('CI Leave & Attendance Bot is running.');
});

// Slack slash command handler: /leave-summary
app.post('/slack/command', async (req, res) => {
    const { command, text, user_name, channel_id } = req.body;
  // Acknowledge immediately
  res.status(200).send('');

  if (command === 'leave-summary') {    await handleSlashCommand({ text, user_name, channel_id });
  }
});

// Scheduled: Daily summary every weekday at 9:00 AM (PH time = UTC+8)
// Cron runs in server local time; adjust TZ env if needed
cron.schedule('0 9 * * 1-5', async () => {
  console.log('[CRON] Running daily attendance summary...');
  await postDailySummary();
}, {
  timezone: process.env.TIMEZONE || 'Asia/Manila'
});

// Scheduled: Weekly summary every Friday at 5:00 PM
cron.schedule('0 17 * * 5', async () => {
  console.log('[CRON] Running weekly leave & attendance summary...');
  await postWeeklySummary();
}, {
  timezone: process.env.TIMEZONE || 'Asia/Manila'
});

app.listen(PORT, () => {
  console.log(`CI Leave & Attendance Bot listening on port ${PORT}`);
});
