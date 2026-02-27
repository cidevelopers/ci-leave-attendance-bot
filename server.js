require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Users to exclude from attendance summaries
const EXCLUDED_USERS = ['Tuaha', 'Sa\'ad', 'tuaha', 'sa\'ad', 'saad', 'Saad'];

// Health check
app.get('/', (req, res) => {
  res.send('CI Leave & Attendance Bot is running.');
});

/**
 * Find channel ID by name
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
 * Fetch messages from a channel
 */
async function fetchChannelMessages(channelId, oldestTimestamp = null) {
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
 * Get user info to map user IDs to names
 */
async function getUserInfo(userId) {
  try {
    const response = await axios.get('https://slack.com/api/users.info', {
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: { user: userId }
    });
    
    if (!response.data.ok) {
      return null;
    }
    
    return response.data.user;
  } catch (err) {
    console.error('Error fetching user info:', err.message);
    return null;
  }
}

/**
 * Parse attendance data from messages
 */
async function parseAttendanceData(messages) {
  const attendance = {};
  
  for (const msg of messages) {
    if (!msg.user || !msg.text) continue;
    
    const userInfo = await getUserInfo(msg.user);
    if (!userInfo) continue;
    
    const userName = userInfo.real_name || userInfo.name;
    
    // Check if user should be excluded
    const shouldExclude = EXCLUDED_USERS.some(excluded => 
      userName.toLowerCase().includes(excluded.toLowerCase())
    );
    
    if (shouldExclude) continue;
    
    const timestamp = new Date(parseFloat(msg.ts) * 1000);
    const date = timestamp.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    const time = timestamp.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'Asia/Manila'
    });
    
    if (!attendance[userName]) {
      attendance[userName] = [];
    }
    
    attendance[userName].push({
      date,
      time,
      text: msg.text,
      timestamp: msg.ts
    });
  }
  
  return attendance;
}

/**
 * Get today's date in Manila timezone
 */
function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/**
 * Get this week's date range (Monday to Friday)
 */
function getWeekDateRange() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  return {
    start: monday.toLocaleDateString('en-CA'),
    end: friday.toLocaleDateString('en-CA')
  };
}

// Slack slash command handler: /leave-summary
app.post('/slack/command', async (req, res) => {
  const { text } = req.body;
  
  const command = (text || '').trim().toLowerCase();
  
  try {
    // Find the attendance channel
    const channelId = await findChannelByName('attendance');
    
    if (!channelId) {
      return res.json({
        response_type: 'ephemeral',
        text: '❌ Could not find #attendance channel. Please make sure the bot is added to that channel.'
      });
    }
    
    let responseText = '';
    
    if (command === 'today' || command === '') {
      // Get today's attendance
      const todayStart = Math.floor(new Date().setHours(0,0,0,0) / 1000);
      const messages = await fetchChannelMessages(channelId, todayStart.toString());
      const attendance = await parseAttendanceData(messages);
      
      const today = getTodayDate();
      const memberCount = Object.keys(attendance).length;
      
      responseText = `📅 *Today's Attendance Summary - ${today}*\n\n`;
      
      if (memberCount === 0) {
        responseText += 'No attendance records found for today.\n';
      } else {
        responseText += `*${memberCount} member(s) checked in:*\n\n`;
        
        for (const [userName, records] of Object.entries(attendance)) {
          const lastRecord = records[records.length - 1];
          responseText += `• ${userName} - Last activity at ${lastRecord.time}\n`;
        }
      }
      
      responseText += `\n_Data from #attendance channel (excluding Tuaha & Sa'ad)_`;
      
    } else if (command === 'week') {
      // Get this week's attendance
      const weekRange = getWeekDateRange();
      const weekStart = Math.floor(new Date(weekRange.start).getTime() / 1000);
      const messages = await fetchChannelMessages(channelId, weekStart.toString());
      const attendance = await parseAttendanceData(messages);
      
      const memberCount = Object.keys(attendance).length;
      
      responseText = `📊 *This Week's Attendance Summary*\n`;
      responseText += `${weekRange.start} to ${weekRange.end}\n\n`;
      
      if (memberCount === 0) {
        responseText += 'No attendance records found for this week.\n';
      } else {
        responseText += `*${memberCount} member(s) active this week:*\n\n`;
        
        for (const [userName, records] of Object.entries(attendance)) {
          responseText += `• ${userName} - ${records.length} check-in(s)\n`;
        }
      }
      
      responseText += `\n_Data from #attendance channel (excluding Tuaha & Sa'ad)_`;
      
    } else if (command === 'list') {
      // Get all recent attendance (last 7 days)
      const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
      const messages = await fetchChannelMessages(channelId, sevenDaysAgo.toString());
      const attendance = await parseAttendanceData(messages);
      
      const memberCount = Object.keys(attendance).length;
      
      responseText = `📋 *All Recent Attendance (Last 7 Days)*\n\n`;
      
      if (memberCount === 0) {
        responseText += 'No attendance records found.\n';
      } else {
        responseText += `*${memberCount} member(s):*\n\n`;
        
        for (const [userName, records] of Object.entries(attendance)) {
          responseText += `• ${userName}\n`;
          records.slice(-3).forEach(record => {
            responseText += `  ◦ ${record.date} at ${record.time}\n`;
          });
        }
      }
      
      responseText += `\n_Data from #attendance channel (excluding Tuaha & Sa'ad)_`;
      
    } else {
      responseText = '*Unknown command*\n\nAvailable commands:\n';
      responseText += '• `/leave-summary` or `/leave-summary today` - Show today\'s attendance\n';
      responseText += '• `/leave-summary week` - Show this week\'s attendance\n';
      responseText += '• `/leave-summary list` - Show all recent attendance';
    }
    
    res.json({
      response_type: 'in_channel',
      text: responseText
    });
    
  } catch (error) {
    console.error('Error processing command:', error);
    res.json({
      response_type: 'ephemeral',
      text: '❌ An error occurred while fetching attendance data. Please try again.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`CI Leave & Attendance Bot listening on port ${PORT}`);
});
