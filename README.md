# CI Leave & Attendance Bot

A Slack bot for **Chameleon Ideas** that provides on-demand leave and attendance summaries. Team members can use slash commands to check who is on leave, file leaves, or view all upcoming absences — keeping the whole team informed without any manual effort.

---

## Features

- **Slash Command** — `/leave-summary` lets any team member check status or file a leave directly from Slack
- **Leave Filing** — Record sick, vacation, emergency, or half-day leaves with date range and reason
- **Leave Listing** — View all active and upcoming leaves at a glance
- **Channel Integration** — Reads from `#attendance` channel and posts summaries to `#ops` channel

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
├── server.js           # Express server + slash command handler
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

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name it "CI Leave & Attendance Bot" and select your workspace
4. Navigate to **OAuth & Permissions**:
   - Add Bot Token Scopes:
     - `channels:read`
     - `channels:history`
     - `chat:write`
     - `commands`
5. Navigate to **Slash Commands** and create a new command:
   - Command: `/leave-summary`
   - Request URL: `https://your-railway-url.railway.app/slack/command`
   - Short Description: "Check leave status or file a leave"
   - Usage Hint: `[today|week|list|file @name type YYYY-MM-DD YYYY-MM-DD reason]`
6. Install the app to your workspace
7. Copy the **Bot User OAuth Token** and **Signing Secret** to your `.env` file

### 5. Deploy to Railway

1. Create a Railway account at [https://railway.app](https://railway.app)
2. Create a new project and link your GitHub repository
3. Add environment variables in Railway:
   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`
   - `ATTENDANCE_CHANNEL_NAME` (default: "attendance")
   - `OPS_CHANNEL_NAME` (default: "ops")
4. Railway will automatically deploy your bot
5. Copy the generated Railway URL and update your Slack slash command Request URL

### 6. Usage

Go to any Slack channel (preferably `#ops`) and use the slash command:

```
/leave-summary today
/leave-summary week
/leave-summary list
/leave-summary file @john sick 2025-03-01 2025-03-02 Not feeling well
```

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token from Slack | `xoxb-...` |
| `SLACK_SIGNING_SECRET` | Signing Secret from Slack | `...` |
| `ATTENDANCE_CHANNEL_NAME` | Channel to read attendance data from | `attendance` |
| `OPS_CHANNEL_NAME` | Channel to post summaries to | `ops` |
| `PORT` | Server port (auto-assigned by Railway) | `8080` |

---

## Technical Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Slack SDK:** @slack/web-api
- **Deployment:** Railway
- **Timezone:** Asia/Manila (Philippine Time)

---

## License

MIT License - Feel free to use and modify for your organization.

---

## Support

For issues or questions, please open an issue on GitHub or contact the Chameleon Ideas development team.
