const axios = require('axios');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Channel names to look up
const SOURCE_CHANNEL_NAME = 'attendance';
const TARGET_CHANNEL_NAME = 'ops';

// In-memory store for leave records (replace with DB/Google Sheet integration as needed)
// Format: { userId, userName, type, startDate, endDate, reason, status }
let leaveRecords = [];

/**
 * Find a channel ID by name using Slack Web API
 */
async function findChannelByName(channelName) {
  try {
    const response = await axios.get('https://slack.com/api/conversations.list', {
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        types: 'public_channel,private_channel',
        limit: 200
      }
    });

    if (!response.data.ok) {
      console.error('Error fetching channels:', response.data.error);
      return null;
    }

    const channel = response.data.channels.find(ch => ch.name === channelName);
    return channel ? channel.id : null;
  } catch (err) {
    console.error('Error finding channel:', err.message);
    return null;
  }
}

/**
 * Post a message to a Slack channel
 */
async function postToChannel(channelId, text = '', blocks = []) {
  try {
    const payload = { channel: channelId, text };
    if (blocks && blocks.length > 0) {
      payload.blocks = blocks;
    }

    const response = await axios.post('https://slack.com/api/chat.postMessage', payload, {
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.ok) {
      console.error('Error posting to Slack:', response.data.error);
    } else {
      console.log('Message posted successfully to channel:', channelId);
    }
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
  const tz = process.env.TIMEZONE || 'Asia/Manila';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return {
    start: monday.toLocaleDateString('en-CA'),
    end: friday.toLocaleDateString('en-CA')
  };
}

/**
 * Parse messages from the attendance channel to extract leave data
 * This is a simple parser that looks for common patterns. Adjust based on your actual message format.
 */
function parseLeaveFromMessages(messages) {
  const leaves = [];
  
  for (const msg of messages) {
    const text = msg.text || '';
    // Example parsing logic - adjust based on your actual message format
    // Looking for patterns like "leave", "PTO", "vacation", date ranges, etc.
    
    // Simple example: detect if message contains leave-related keywords
    const leaveKeywords = ['leave', 'pto', 'vacation', 'sick', 'day off', 'absent'];
    const hasLeaveKeyword = leaveKeywords.some(kw => text.toLowerCase().includes(kw));
    
    if (hasLeaveKeyword && msg.user) {
      leaves.push({
        userId: msg.user,
        text: text,
        timestamp: msg.ts,
        date: new Date(parseFloat(msg.ts) * 1000).toLocaleDateString('en-CA')
      });
    }
  }
  
  return leaves;
}

/**
 * Fetch messages from attendance channel for a given time period
 */
async function fetchAttendanceMessages(channelId, oldestTimestamp = null) {
  try {
    const params = {
      channel: channelId,
      limit: 100
    };
    
    if (oldestTimestamp) {
      params.oldest = oldestTimestamp;
    }

    const response = await axios.get('https://slack.com/api/conversations.history', {
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params
    });

    if (!response.data.ok) {
      console.error('Error fetching messages:', response.data.error);
      return [];
    }

    return response.data.messages || [];
  } catch (err) {
    console.error('Error fetching messages:', err.message);
    return [];
  }
}

/**
 * Post daily leave summary to ops channel
 */
async function postDailySummary() {
  try {
    console.log('Generating daily leave summary...');
    
    const sourceChannelId = await findChannelByName(SOURCE_CHANNEL_NAME);
    const targetChannelId = await findChannelByName(TARGET_CHANNEL_NAME);
    
    if (!sourceChannelId) {
      console.error(`Could not find source channel: #${SOURCE_CHANNEL_NAME}`);
      return;
    }
    
    if (!targetChannelId) {
      console.error(`Could not find target channel: #${TARGET_CHANNEL_NAME}`);
      return;
    }

    // Get messages from last 24 hours
    const yesterday = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
    const messages = await fetchAttendanceMessages(sourceChannelId, yesterday.toString());
    
    const leaves = parseLeaveFromMessages(messages);
    const today = getTodayString();

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📅 Daily Leave Summary - ${today}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: leaves.length > 0 
            ? `*Found ${leaves.length} leave-related message(s) in #${SOURCE_CHANNEL_NAME} (last 24h):*`
            : `No leave messages found in #${SOURCE_CHANNEL_NAME} in the last 24 hours.`
        }
      }
    ];

    if (leaves.length > 0) {
      for (const leave of leaves) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• <@${leave.userId}>: ${leave.text.substring(0, 200)}${leave.text.length > 200 ? '...' : ''}`
          }
        });
      }
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Posted by CI Leave Attendance Bot • Data from #${SOURCE_CHANNEL_NAME}_`
        }
      ]
    });

    await postToChannel(targetChannelId, `Daily Leave Summary - ${today}`, blocks);
    console.log('Daily summary posted successfully');
  } catch (err) {
    console.error('Error in postDailySummary:', err.message);
  }
}

/**
 * Post weekly leave summary to ops channel
 */
async function postWeeklySummary() {
  try {
    console.log('Generating weekly leave summary...');
    
    const sourceChannelId = await findChannelByName(SOURCE_CHANNEL_NAME);
    const targetChannelId = await findChannelByName(TARGET_CHANNEL_NAME);
    
    if (!sourceChannelId) {
      console.error(`Could not find source channel: #${SOURCE_CHANNEL_NAME}`);
      return;
    }
    
    if (!targetChannelId) {
      console.error(`Could not find target channel: #${TARGET_CHANNEL_NAME}`);
      return;
    }

    const weekRange = getCurrentWeekRange();
    
    // Get messages from the past week
    const lastWeek = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    const messages = await fetchAttendanceMessages(sourceChannelId, lastWeek.toString());
    
    const leaves = parseLeaveFromMessages(messages);

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Weekly Leave Summary - Week of ${weekRange.start}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${weekRange.start} to ${weekRange.end}*\n\n` +
                (leaves.length > 0 
                  ? `Found ${leaves.length} leave-related message(s) in #${SOURCE_CHANNEL_NAME} this week:`
                  : `No leave messages found in #${SOURCE_CHANNEL_NAME} this week.`)
        }
      }
    ];

    if (leaves.length > 0) {
      // Group by user
      const byUser = {};
      for (const leave of leaves) {
        if (!byUser[leave.userId]) {
          byUser[leave.userId] = [];
        }
        byUser[leave.userId].push(leave);
      }

      for (const [userId, userLeaves] of Object.entries(byUser)) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<@${userId}>* (${userLeaves.length} message(s))`
          }
        });
        
        for (const leave of userLeaves.slice(0, 3)) { // Show first 3
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `  ◦ ${leave.date}: ${leave.text.substring(0, 150)}${leave.text.length > 150 ? '...' : ''}`
            }
          });
        }
      }
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Posted by CI Leave Attendance Bot • Data from #${SOURCE_CHANNEL_NAME}_`
        }
      ]
    });

    await postToChannel(targetChannelId, `Weekly Leave Summary - ${weekRange.start}`, blocks);
    console.log('Weekly summary posted successfully');
  } catch (err) {
    console.error('Error in postWeeklySummary:', err.message);
  }
}

/**
 * Handle the /leave-summary slash command
 */
async function handleSlashCommand(req, res) {
  try {
    const { text, user_id, channel_id } = req.body;
    
    // Acknowledge the command immediately
    res.status(200).send('Generating leave summary...');

    const command = (text || '').trim().toLowerCase();

    if (command === 'daily' || command === '') {
      await postDailySummary();
    } else if (command === 'weekly') {
      await postWeeklySummary();
    } else if (command === 'help') {
      const targetChannelId = await findChannelByName(TARGET_CHANNEL_NAME);
      if (targetChannelId) {
        await postToChannel(targetChannelId, 'Leave Bot Help', [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Available Commands:*\n' +
                    '• `/leave-summary` or `/leave-summary daily` - Get today\'s leave summary\n' +
                    '• `/leave-summary weekly` - Get this week\'s leave summary\n' +
                    '• `/leave-summary help` - Show this help message'
            }
          }
        ]);
      }
    } else {
      const targetChannelId = await findChannelByName(TARGET_CHANNEL_NAME);
      if (targetChannelId) {
        await postToChannel(targetChannelId, 'Unknown command. Use `/leave-summary help` for available commands.');
      }
    }
  } catch (err) {
    console.error('Error handling slash command:', err.message);
    res.status(500).send('Error processing command');
  }
}

module.exports = {
  postDailySummary,
  postWeeklySummary,
  handleSlashCommand,
  findChannelByName,
  postToChannel
};
