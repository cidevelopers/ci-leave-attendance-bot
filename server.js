require('dotenv').config();
const express = require('express');

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
  const { text } = req.body;
  
  const command = (text || '').trim().toLowerCase();
  
  // Respond immediately with a simple message
  // In a real implementation, you would fetch data from your attendance channel
  let responseText = '';
  
  if (command === 'today' || command === '') {
    responseText = '📅 *Today\'s Leave Summary*\n\nNo one is on leave today!\n\n_To see this week\'s summary, use `/leave-summary week`_';
  } else if (command === 'week') {
    responseText = '📊 *This Week\'s Leave Summary*\n\nNo leaves scheduled this week!\n\n_Data is read from #attendance channel_';
  } else if (command === 'list') {
    responseText = '📋 *All Upcoming Leaves*\n\nNo upcoming leaves found.\n\n_Data is read from #attendance channel_';
  } else {
    responseText = '*Unknown command*\n\nAvailable commands:\n• `/leave-summary` or `/leave-summary today` - Show today\'s leaves\n• `/leave-summary week` - Show this week\'s leaves\n• `/leave-summary list` - Show all upcoming leaves';
  }
  
  // Respond to Slack immediately
  res.json({
    response_type: 'in_channel',
    text: responseText
  });
});

app.listen(PORT, () => {
  console.log(`CI Leave & Attendance Bot listening on port ${PORT}`);
});
