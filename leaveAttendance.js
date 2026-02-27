canconst axios = require('axios');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Channel names to look up
const SOURCE_CHANNEL_NAME = 'attendance';
const TARGET_CHANNEL_NAME = 'ops';

// Users to exclude from attendance tracking (managers)
const EXCLUDED_USERS = ['Tuaha', 'Sa\'ad'];

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
 * Get channel members with user info
 */
async function getChannelMembers(channelId) {
  try {
    // Get channel members
    const membersResponse = await axios.get('https://slack.com/api/conversations.members', {
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: { channel: channelId }
    });

    if (!membersResponse.data.ok) {
      console.error('Error fetching members:', membersResponse.data.error);
      return [];
    }

    const userIds = membersResponse.data.members || [];
    const users = [];

    // Get user info for each member
    for (const userId of userIds) {
      try {
        const userResponse = await axios.get('https://slack.com/api/users.info', {
          headers: {
            'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          params: { user: userId }
        });

        if (userResponse.data.ok && userResponse.data.user) {
          const user = userResponse.data.user;
          // Exclude bots and excluded users
          if (!user.is_bot && !EXCLUDED_USERS.includes(user.real_name || user.name)) {
            users.push({
              id: userId,
              name: user.real_name || user.name
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching user ${userId}:`, err.message);
      }
    }

    return users;
  } catch (err) {
    console.error('Error in getChannelMembers:', err.message);
    return [];
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
 * Parse messages from the attendance channel to track check-ins ("in" messages)
  */
function parseLeaveFromMessages(messages) {
    const attendance = [];
  
  for (const msg of messages) {
    const text = msg.text || '';
    
    // Only count messages that are exactly 'in' or start with 'in '    if (text.toLowerCase().includes('in') && msg.user) {
    const lowerText = text.toLowerCase().trim();
    // Check if message is exactly 'in' or starts with 'in ' (to avoid matching 'break', 'working', etc.)
    const isCheckIn = lowerText === 'in' || lowerText.startsWith('in ');
    
    if (isCheckIn && msg.user) {        userId: msg.user,
        text: text,
        timestamp: msg.ts,
        date: new Date(parseFloat(msg.ts) * 1000).toLocaleDateString('en-CA')
      });
    }
  }
  
  return attendance
    }

/**
 * Fetch messages from attendance channel for a given time period
 */
;ync function fetchAttendanceMessages(channelId, oldestTimestamp = null) {
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
 * Post daily attendance summary to ops cha */
async function postDailySummary() {
    console.log('Geneerating daily attendance summary...'
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
    
    co    // Get all channel members
    const allMembers = await getChannelMembers(sourceChannelId);
    const attendance = parseLeaveFromMessages(messages);
    const today = getTodayString();

    // Get list of users who checked in
    const checkedInUserIds = new Set(attendance.map(a => a.userId));
    
    // Find absent members (excluding managers)
    const absentMembers = allMembers.filter(member => !checkedInUserIds.has(member.id));

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Daily Attendance Summary - ${today}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${attendance.length} member(s) checked in today*`
        }
      }
    ];

    if (attendance.length > 0) {
      for (const record of attendance) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ <@${record.userId}>`
          }
        });
      }
    }

    // Show absent members
    if (absentMembers.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\n*⚠️ Absent Today (${absentMembers.length} member(s)):*`
        }
      });

      for (const member of absentMembers) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❌ <@${member.id}> (${member.name})`
          }
        });
      }
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Posted by CI Attendance Bot • Data from #${SOURCE_CHANNEL_NAME}_`
        }
      ]
    });

    await postToChannel(targetChannelId, `Daily Attendance Summary - ${today}`, blocks);
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
    console.log('Generating weekly attendance summary...');

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

    // Get all channel members
    const allMembers = await getChannelMembers(sourceChannelId);
    
    // Filter out excluded users
    const trackableMembers = allMembers.filter(member => 
      !EXCLUDED_USERS.includes(member.real_name) && !member.is_bot
    );

    // Parse attendance from messages - only messages containing "in"
    const attendanceByUser = {};
    const attendanceDates = new Set();

    for (const message of messages) {
      if (message.text && message.text.toLowerCase().trim() === 'in' && message.user) {
        const date = new Date(parseFloat(message.ts) * 1000).toISOString().split('T')[0];
        attendanceDates.add(date);
        
        if (!attendanceByUser[message.user]) {
          attendanceByUser[message.user] = new Set();
        }
        attendanceByUser[message.user].add(date);
      }
    }

    // Convert sets to counts
    const attendanceCounts = {};
    for (const [userId, dates] of Object.entries(attendanceByUser)) {
      attendanceCounts[userId] = dates.size;
    }

    // Find absent members (those who never checked in this week)
    const presentUserIds = Object.keys(attendanceCounts);
    const absentMembers = trackableMembers.filter(member => 
      !presentUserIds.includes(member.id)
    );

    // Build summary
    const totalActive = Object.keys(attendanceCounts).length;
    
    let summaryText = `${weekRange.start} to ${weekRange.end}\n\n`;
    
    if (totalActive > 0) {
      summaryText += `*${totalActive} member(s) checked in this week:*\n\n`;
      
      // Sort by check-in count (descending)
      const sorted = Object.entries(attendanceCounts).sort((a, b) => b[1] - a[1]);
      
      for (const [userId, count] of sorted) {
        const member = trackableMembers.find(m => m.id === userId);
        const displayName = member ? member.real_name : `<@${userId}>`;
        summaryText += `• ${displayName} - ${count} check-in(s)\n`;
      }
    } else {
      summaryText += `No check-ins found this week.\n`;
    }

    if (absentMembers.length > 0) {
      summaryText += `\n*${absentMembers.length} member(s) absent this week:*\n`;
      for (const member of absentMembers) {
        summaryText += `• ${member.real_name}\n`;
      }
    }

    summaryText += `\n_Data from #${SOURCE_CHANNEL_NAME} (excluding ${EXCLUDED_USERS.join(', ')})_`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 This Week's Attendance Summary`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: summaryText
        }
      }
    ];

    await postToChannel(targetChannelId, `Weekly Attendance Summary - ${weekRange.start}`, blocks);
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
