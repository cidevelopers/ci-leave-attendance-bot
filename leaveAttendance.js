const axios = require('axios');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// In-memory store for leave records (replace with DB/Google Sheet integration as needed)
// Format: { userId, userName, type, startDate, endDate, reason, status }
let leaveRecords = [];

/**
 * Post a message to Slack via Incoming Webhook
 */
async function postToSlack(blocks, text = '') {
  try {
    await axios.post(SLACK_WEBHOOK_URL, { text, blocks });
  } catch (err) {
    console.error('Error posting to Slack:', err.message);
  }
}

/**
 * Get today's date string in YYYY-MM-DD format (Manila timezone)
 */
function getTodayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: process.env.TIMEZONE || 'Asia/Manila' });
}

/**
 * Get date range for the current week (Mon-Fri)
 */
function getCurrentWeekRange() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: process.env.TIMEZONE || 'Asia/Manila' }));
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d) => d.toLocaleDateString('en-CA');
  return { start: fmt(monday), end: fmt(friday) };
}

/**
 * Daily summary: show who is on leave today
 */
async function postDailySummary() {
  const today = getTodayString();
  const onLeave = leaveRecords.filter(
    (r) => r.status === 'approved' && r.startDate <= today && r.endDate >= today
  );

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `:calendar: Daily Attendance Summary - ${today}`, emoji: true }
    },
    { type: 'divider' }
  ];

  if (onLeave.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*All team members are present today!* :white_check_mark:' }
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Team members on leave today (${onLeave.length}):*` }
    });
    onLeave.forEach((r) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:person_gesturing_no: *${r.userName}* - ${r.type} leave\n> Reason: ${r.reason || 'N/A'}\n> Period: ${r.startDate} to ${r.endDate}`
        }
      });
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: 'Chameleon Ideas | Use `/leave-summary` to check leave status anytime.' }]
  });

  await postToSlack(blocks, `Daily Attendance Summary - ${today}`);
}

/**
 * Weekly summary: show all leave this week
 */
async function postWeeklySummary() {
  const { start, end } = getCurrentWeekRange();
  const weekLeaves = leaveRecords.filter(
    (r) => r.status === 'approved' && r.startDate <= end && r.endDate >= start
  );

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `:bar_chart: Weekly Leave & Attendance Summary`, emoji: true }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Week:* ${start} to ${end}` }
    },
    { type: 'divider' }
  ];

  if (weekLeaves.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*No leaves filed this week.* :tada:' }
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Total leaves this week: ${weekLeaves.length}*` }
    });
    weekLeaves.forEach((r) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:memo: *${r.userName}* | ${r.type} | ${r.startDate} - ${r.endDate}\n> ${r.reason || 'No reason provided'} | Status: *${r.status}*`
        }
      });
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: 'Chameleon Ideas | Have a great weekend! :wave:' }]
  });

  await postToSlack(blocks, `Weekly Leave Summary: ${start} to ${end}`);
}

/**
 * Handle /leave-summary slash command
 * Supports: /leave-summary today | week | file [name] [type] [start] [end] [reason]
 */
async function handleSlashCommand({ text, user_name, channel_id }) {
  const args = (text || '').trim().split(/\s+/);
  const subcommand = (args[0] || 'today').toLowerCase();

  if (subcommand === 'today') {
    await postDailySummary();
  } else if (subcommand === 'week') {
    await postWeeklySummary();
  } else if (subcommand === 'file') {
    // Usage: /leave-summary file @name type YYYY-MM-DD YYYY-MM-DD reason
    const [, nameArg, type, startDate, endDate, ...reasonArr] = args;
    const userName = nameArg ? nameArg.replace('@', '') : user_name;
    const reason = reasonArr.join(' ') || 'N/A';

    if (!type || !startDate || !endDate) {
      await postToSlack(null, `Usage: /leave-summary file @name [sick|vacation|emergency|halfday] YYYY-MM-DD YYYY-MM-DD [reason]`);
      return;
    }

    const record = {
      userId: userName,
      userName,
      type,
      startDate,
      endDate,
      reason,
      status: 'approved',
      filedBy: user_name,
      filedAt: new Date().toISOString()
    };

    leaveRecords.push(record);

    await postToSlack([
      {
        type: 'header',
        text: { type: 'plain_text', text: ':white_check_mark: Leave Filed Successfully', emoji: true }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Employee:*\n${userName}` },
          { type: 'mrkdwn', text: `*Leave Type:*\n${type}` },
          { type: 'mrkdwn', text: `*From:*\n${startDate}` },
          { type: 'mrkdwn', text: `*To:*\n${endDate}` },
          { type: 'mrkdwn', text: `*Reason:*\n${reason}` },
          { type: 'mrkdwn', text: `*Filed by:*\n${user_name}` }
        ]
      }
    ], `Leave filed for ${userName}`);
  } else if (subcommand === 'list') {
    const today = getTodayString();
    const active = leaveRecords.filter((r) => r.endDate >= today);
    if (active.length === 0) {
      await postToSlack(null, 'No upcoming or active leaves on record.');
    } else {
      const lines = active.map((r) => `• *${r.userName}* - ${r.type} (${r.startDate} to ${r.endDate})`).join('\n');
      await postToSlack([{
        type: 'section',
        text: { type: 'mrkdwn', text: `*All Active/Upcoming Leaves:*\n${lines}` }
      }], 'Active leaves');
    }
  } else {
    await postToSlack(null,
      'Available commands:\n• `/leave-summary today` - Who is out today\n• `/leave-summary week` - This week\'s summary\n• `/leave-summary file @name type YYYY-MM-DD YYYY-MM-DD reason` - File a leave\n• `/leave-summary list` - All active/upcoming leaves'
    );
  }
}

module.exports = { postDailySummary, postWeeklySummary, handleSlashCommand };
