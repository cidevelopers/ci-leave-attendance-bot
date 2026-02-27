# CI Leave & Attendance Bot

A Slack bot for **Chameleon Ideas** that automates leave filing and attendance summaries. It posts daily check-ins every weekday morning and a full weekly leave summary every Friday — keeping the whole team informed without any manual effort.

---

## Features

- **Daily Summary** — Automatically posts at 9:00 AM (Manila time) every weekday with who is on leave
- **Weekly Summary** — Automatically posts at 5:00 PM every Friday with the full week's leave overview
- **Slash Command** — `/leave-summary` lets any team member check status or file a leave directly from Slack
- **Leave Filing** — Record sick, vacation, emergency, or half-day leaves with date range and reason
- **Leave Listing** — View all active and upcoming leaves at a glance

---

## Slash Command Usage

| Command | Description |
|---|---|
| `/leave-summary today` | Show who is on leave today |
| `/leave-summary week` | Show this week's leave summary |
| `/leave-summary file @name type YYYY-MM-DD YYYY-MM-DD reason` | File a leave |
| `/leave-summary list` | List all active/upcoming leaves |

**Leave types:** `sick`, `vacation`, `emergency`, `halfday`

**Example:**
```
/leave-summary file @juan sick 2025-07-14 2025-07-15 Flu and fever
```

---

## Project Structure

```
ci-leave-attendance-bot/
├── server.js           # Express server + cron job schedules
├── leaveAttendance.js  # Core leave/attendance logic & Slack messaging
├── package.json        # Dependencies
├── .env.example        # Environment variable template
└── README.md
```

---

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/cidevelopers/ci-leave-attendance-bot.git
cd ci-leave-attendance-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
```bash
cp .env.example .env
# Edit .env and fill in your Slack credentials
```

### 4. Create a Slack App
1. Go to https://api.slack.com/apps and click **Create New App**
2. Choose **From scratch**, name it `CI Leave Bot`, select your workspace
3. Under **Incoming Webhooks**, enable it and add a webhook for your `#attendance` or `#general` channel
4. Under **Slash Commands**, create `/leave-summary` pointing to `https://your-server.com/slack/commands`
5. Under **OAuth & Permissions**, add scopes: `chat:write`, `commands`
6. Copy the **Webhook URL**, **Bot Token**, and **Signing Secret** into your `.env`

### 5. Run the bot
```bash
npm start
```

---

## Deployment

You can deploy this to any Node.js hosting platform:

- **Railway** — Connect your GitHub repo and set environment variables in the dashboard
- **Render** — Free tier available, set `npm start` as the start command
- **Heroku** — `git push heroku main` after configuring Config Vars
- **VPS** — Use `pm2 start server.js` for process management

> Make sure your deployment URL is publicly accessible so Slack can reach `/slack/commands` for slash commands.

---

## Environment Variables

| Variable | Description |
|---|---|
| `SLACK_WEBHOOK_URL` | Incoming Webhook URL from Slack |
| `SLACK_BOT_TOKEN` | Bot OAuth Token (xoxb-...) |
| `SLACK_SIGNING_SECRET` | For verifying slash command payloads |
| `PORT` | Server port (default: 3000) |
| `TIMEZONE` | Cron timezone (default: Asia/Manila) |
| `DAILY_CHANNEL_ID` | Channel for daily summaries |
| `WEEKLY_CHANNEL_ID` | Channel for weekly summaries |

---

## Built With

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [node-cron](https://github.com/node-cron/node-cron)
- [axios](https://axios-http.com/)
- [Slack Block Kit](https://api.slack.com/block-kit)

---

*Chameleon Ideas — Internal Operations Bot*
