// index.js — FINAL all-in-one (teams + moderation + AI + /ask + ping + reply)
// Node 18+, discord.js v14
// IMPORTANT: set env var TOKEN (and OPENAI_KEY if you want AI)

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  PermissionFlagsBits
} = require('discord.js');

// ----------------- DEBUG -----------------
console.log('DEBUG OPENAI_KEY:', process.env.OPENAI_KEY ? 'Loaded ✅' : '❌ MISSING');
console.log('DEBUG TOKEN:', process.env.TOKEN ? 'Loaded ✅' : '❌ MISSING');

// ----------------- CLIENT -----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ----------------- CONFIG -----------------
const TEAMS_CHANNEL_NAME = "🫂┃teams";
const FALLBACK_CHANNEL_IDS = [
  "1389976721704489010",
  "1425816192693571637"
];
const INSTANT_GUILD_IDS = [
  "1361474123972481086",
  "1368328809861873664",
  "1368618794767089816",
  "1414997585080356927",
  "1425669546794029058",
  "1427364420098723974"
];
const GOAT_ID = "1094566631281270814"; // fun ping in ephemeral replies

// ----------------- DATA FILE -----------------
const DATA_PATH = path.join(__dirname, 'data.json');
let DATA = {};
try {
  if (fs.existsSync(DATA_PATH)) DATA = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}');
} catch (e) { DATA = {}; }
function saveData() { try { fs.writeFileSync(DATA_PATH, JSON.stringify(DATA, null, 2)); } catch (e) {} }

// ----------------- TIMERS -----------------
const tempTimers = new Map();

// ----------------- HELPERS -----------------
function big(text) { return `**__${String(text).toUpperCase()}__**`; }

function findTeamChannel(guild) {
  if (!guild) return null;
  const byName = guild.channels.cache.find(c => c.name === TEAMS_CHANNEL_NAME);
  if (byName) return byName;
  for (const id of FALLBACK_CHANNEL_IDS) {
    const ch = guild.channels.cache.get(id);
    if (ch) return ch;
  }
  return null;
}

function parseDurationToMs(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 60_000; // minutes default
  const m = s.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10), u = m[2];
  if (u === 's') return n * 1000;
  if (u === 'm') return n * 60_000;
  if (u === 'h') return n * 60_000 * 60;
  if (u === 'd') return n * 60_000 * 60 * 24;
  return null;
}

function makeActionDMEmbed(guild, action, reason, durationStr = null) {
  const titles = {
    ban: 'You have been banned',
    tempban: 'You have been temp-banned',
    kick: 'You have been kicked',
    timeout: 'You have been timed out'
  };
  const roastLines = [
    "Maybe the real griefing was the mistakes you made.",
    "You tried. The server didn't agree. It's not you, it's your playskill.",
    "Go practice in singleplayer and come back when you can behave."
  ];
  const roast = roastLines[Math.floor(Math.random() * roastLines.length)];
  const parts = [];
  parts.push(`**Server:** ${guild?.name || 'Unknown'}`);
  if (durationStr) parts.push(`**Duration:** ${durationStr}`);
  parts.push(`**Reason:** ${reason || 'No reason provided'}`);
  parts.push(`\n_${roast}_`);
  return new EmbedBuilder().setTitle(titles[action] || 'Action taken').setDescription(parts.join('\n')).setColor(0xFF4444).setTimestamp();
}

function makeLogEmbed(action, moderator, targetTag, targetId, reason, extra = '') {
  const e = new EmbedBuilder()
    .setTitle(action)
    .addFields(
      { name: 'Moderator', value: `${moderator.tag} (${moderator.id})`, inline: true },
      { name: 'Target', value: `${targetTag}\n(${targetId})`, inline: true }
    )
    .setDescription(reason || 'No reason provided')
    .setColor(0xFF5555)
    .setTimestamp();
  if (extra) e.addFields({ name: 'Extra', value: extra });
  return e;
}

// Log channel helpers (topic marker persistence + env var support)
async function ensureLogChannel(guild) {
  const envKey = `MOD_LOG_${guild.id}`;
  if (process.env[envKey]) {
    const ch = guild.channels.cache.get(process.env[envKey]);
    if (ch) return ch;
  }
  const marker = `__MOD_LOG__:${guild.id}`;
  const byTopic = guild.channels.cache.find(c => c.topic && c.topic.includes(marker));
  if (byTopic) return byTopic;
  const byName = guild.channels.cache.find(c => c.name === '🔒┃moderation-logs');
  if (byName) {
    try {
      if (!byName.topic || !byName.topic.includes(marker)) await byName.setTopic((byName.topic || '') + ' ' + marker).catch(() => {});
    } catch (e) {}
    return byName;
  }
  try {
    const created = await guild.channels.create({ name: '🔒┃moderation-logs', type: 0, reason: 'Auto-created moderation log channel' });
    try { await created.setTopic(marker).catch(() => {}); } catch (e) {}
    DATA.logChannels = DATA.logChannels || {}; DATA.logChannels[guild.id] = created.id; saveData();
    try {
      const owner = await guild.fetchOwner();
      await owner.send(`Created mod log channel (${created.name}) for ${guild.name}. To persist set env var MOD_LOG_${guild.id}=${created.id}`).catch(() => {});
    } catch (e) {}
    return created;
  } catch (e) {
    console.log('Failed to create mod log channel:', e?.message || e);
    return null;
  }
}
function getLogChannelCached(guild) {
  const envKey = `MOD_LOG_${guild.id}`;
  if (process.env[envKey]) {
    const ch = guild.channels.cache.get(process.env[envKey]); if (ch) return ch;
  }
  const marker = `__MOD_LOG__:${guild.id}`;
  const byTopic = guild.channels.cache.find(c => c.topic && c.topic.includes(marker)); if (byTopic) return byTopic;
  if (DATA.logChannels && DATA.logChannels[guild.id]) { const ch = guild.channels.cache.get(DATA.logChannels[guild.id]); if (ch) return ch; }
  const byName = guild.channels.cache.find(c => c.name === '🔒┃moderation-logs'); if (byName) return byName;
  return null;
}
async function sendLog(guild, embed) {
  try {
    let ch = getLogChannelCached(guild);
    if (!ch) ch = await ensureLogChannel(guild);
    if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {}
}

// ----------------- COMMANDS -----------------
const commands = [
  {
    name: 'ban',
    description: 'Ban management (add = ban user, remove = unban by ID)',
    options: [
      {
        name: 'add',
        type: 1,
        description: 'Ban a user from the server',
        options: [
          { name: 'user', type: 6, required: true, description: 'User to ban' },
          { name: 'reason', type: 3, required: false, description: 'Reason for ban' }
        ]
      },
      {
        name: 'remove',
        type: 1,
        description: 'Unban a user by ID',
        options: [
          { name: 'userid', type: 3, required: true, description: 'User ID to unban' },
          { name: 'reason', type: 3, required: false, description: 'Reason for unban (optional)' }
        ]
      }
    ],
    default_member_permissions: String(PermissionFlagsBits.BanMembers)
  },
  {
    name: 'tempban',
    description: 'Ban a user for a limited time (e.g. 30m, 2h, 1d)',
    options: [
      { name: 'user', type: 6, required: true, description: 'User to temp-ban' },
      { name: 'duration', type: 3, required: true, description: 'Duration (30m, 2h, 1d)' },
      { name: 'reason', type: 3, required: false, description: 'Reason for tempban' }
    ],
    default_member_permissions: String(PermissionFlagsBits.BanMembers)
  },
  {
    name: 'kick',
    description: 'Kick a user from the server',
    options: [
      { name: 'user', type: 6, required: true, description: 'User to kick' },
      { name: 'reason', type: 3, required: false, description: 'Reason for kick' }
    ],
    default_member_permissions: String(PermissionFlagsBits.KickMembers)
  },
  {
    name: 'mute',
    description: 'Timeout (mute) a user using Discord timeout',
    options: [
      { name: 'user', type: 6, required: true, description: 'User to timeout' },
      { name: 'duration', type: 3, required: false, description: 'Duration like 10m, 2h (leave empty for permanent until unmute)' },
      { name: 'reason', type: 3, required: false, description: 'Reason for timeout' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers)
  },
  {
    name: 'unmute',
    description: 'Remove timeout from a user',
    options: [
      { name: 'user', type: 6, required: true, description: 'User to remove timeout from' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers)
  },
  {
    name: 'purge',
    description: 'Bulk delete messages in channel (2-100)',
    options: [
      { name: 'amount', type: 4, required: true, description: 'Number of messages to delete (2-100)' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageMessages)
  },
  {
    name: 'say',
    description: 'Make the bot say something in this channel (mod-only)',
    options: [
      { name: 'message', type: 3, required: true, description: 'Message for the bot to send' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },
  {
    name: 'announce',
    description: 'Post an announcement embed (optionally ping everyone)',
    options: [
      { name: 'message', type: 3, required: true, description: 'Announcement message' },
      { name: 'ping', type: 5, required: false, description: 'Ping @everyone?' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },
  { name: 'ping', description: 'Check bot latency' },
  {
    name: 'oni',
    description: 'Oni Studio info (DM)',
    options: [
      { name: 'info', type: 1, description: 'Receive Oni Studios community info via DM' }
    ]
  },
  {
    name: 'panel',
    description: 'Post the Team Registration panel in the teams channel (mod-only)',
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },
  {
    name: 'save-log',
    description: 'Show the moderation log channel ID and how to persist it (mod-only)',
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },
  {
    name: 'ask',
    description: 'Ask the AI (if available)',
    options: [
      { name: 'question', type: 3, required: true, description: 'Question to ask' }
    ]
  }
];

// ----------------- REGISTER COMMANDS -----------------
async function registerCommands() {
  if (!process.env.TOKEN) { console.log('TOKEN not set — skipping command registration.'); return; }
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    console.log('Registering global commands (may take upto 1 hour)...');
    const appId = (await client.application.fetch()).id;
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log('Global commands registered (request sent).');
  } catch (e) {
    console.log('Global register error:', e?.message || e);
  }

  for (const gid of INSTANT_GUILD_IDS) {
    try {
      if (!client.guilds.cache.has(gid)) { console.log(`Skipping guild register for ${gid} — bot not in guild`); continue; }
      const appId = (await client.application.fetch()).id;
      await rest.put(Routes.applicationGuildCommands(appId, gid), { body: commands });
      console.log(`Instant guild registered: ${gid}`);
    } catch (e) {
      console.log(`Guild register error ${gid}:`, e?.message || e);
    }
  }
}

// ----------------- READY -----------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands().catch(()=>{});

  // For every guild: delete previous PANEL messages posted by this bot (only panel embed), then post new panel
  client.guilds.cache.forEach(async (guild) => {
    try {
      const teamChan = findTeamChannel(guild);
      if (!teamChan) { console.log(`No teams channel in ${guild.name} (${guild.id})`); await ensureLogChannel(guild).catch(()=>{}); return; }

      // fetch recent messages and delete only the previous panel(s) (bot-authored embed title contains 'TEAM REGISTRATION PANEL')
      try {
        const messages = await teamChan.messages.fetch({ limit: 100 });
        const panels = messages.filter(m => m.author && m.author.id === client.user.id && m.embeds && m.embeds[0] && typeof m.embeds[0].title === 'string' && m.embeds[0].title.toLowerCase().includes('team registration panel'));
        for (const [id, m] of panels) {
          try { await m.delete().catch(()=>{}); } catch(e) {}
        }
      } catch (e) {
        console.log('Failed to clean previous panels in', guild.id, e?.message || e);
      }

      // send fresh panel
      const embed = new EmbedBuilder()
        .setTitle('🟨 TEAM REGISTRATION PANEL')
        .setColor(0xFFD700)
        .setDescription('Choose an option below.\n\n**⚠️ To ping a teammate:** Type their @ like `@username` inside the form.');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('register_team').setLabel('➕ Register Your Team').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('need_team').setLabel('🔍 Look For a Team').setStyle(ButtonStyle.Primary)
      );
      await teamChan.send({ embeds: [embed], components: [row] }).catch(()=>{});

      await ensureLogChannel(guild).catch(()=>{});
    } catch (e) {
      console.log('Startup guild error', guild.id, e?.message || e);
    }
  });
});

// ----------------- INTERACTIONS -----------------
client.on('interactionCreate', async (interaction) => {
  try {
    // Buttons
    if (interaction.isButton()) {
      if (interaction.customId === 'register_team') {
        const modal = new ModalBuilder().setCustomId('team_modal').setTitle('Register Your Team');
        const teamName = new TextInputBuilder().setCustomId('team_name').setLabel('📝 Team Name (Required)').setStyle(TextInputStyle.Short).setRequired(true);
        const m1 = new TextInputBuilder().setCustomId('m1').setLabel('⭐ Member 1 (required)').setStyle(TextInputStyle.Short).setRequired(true);
        const m2 = new TextInputBuilder().setCustomId('m2').setLabel('Member 2 (optional)').setStyle(TextInputStyle.Short).setRequired(false);
        const m3 = new TextInputBuilder().setCustomId('m3').setLabel('Member 3 (optional)').setStyle(TextInputStyle.Short).setRequired(false);
        const m45 = new TextInputBuilder().setCustomId('m45').setLabel('Members 4 & 5 (comma separated)').setStyle(TextInputStyle.Short).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(teamName), new ActionRowBuilder().addComponents(m1), new ActionRowBuilder().addComponents(m2), new ActionRowBuilder().addComponents(m3), new ActionRowBuilder().addComponents(m45));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'need_team') {
        const modal = new ModalBuilder().setCustomId('lf_modal').setTitle('Looking For a Team');
        const about = new TextInputBuilder().setCustomId('about').setLabel('What are your cool things / about you?').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const hours = new TextInputBuilder().setCustomId('hours').setLabel('How long will you be online?').setStyle(TextInputStyle.Short).setRequired(true);
        const timezone = new TextInputBuilder().setCustomId('timezone').setLabel('Your Timezone (Ex: IST)').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(about), new ActionRowBuilder().addComponents(hours), new ActionRowBuilder().addComponents(timezone));
        return interaction.showModal(modal);
      }
    }

    // Modal submits
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'team_modal') {
        const guild = interaction.guild;
        const teamChan = findTeamChannel(guild);
        if (!teamChan) return interaction.reply({ content: '⚠️ No teams channel found in this server.', ephemeral: true });

        const name = interaction.fields.getTextInputValue('team_name');
        const m1 = interaction.fields.getTextInputValue('m1');
        const m2 = interaction.fields.getTextInputValue('m2') || '—';
        const m3 = interaction.fields.getTextInputValue('m3') || '—';
        const raw45 = interaction.fields.getTextInputValue('m45') || '';
        let m4 = '—', m5 = '—';
        if (raw45.includes(',')) { const parts = raw45.split(',').map(s => s.trim()); m4 = parts[0] || '—'; m5 = parts[1] || '—'; } else if (raw45.trim()) m4 = raw45.trim();

        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${big(name)}`)
          .setColor(0x00FF66)
          .setDescription(`**Member 1:** ${m1}\n**Member 2:** ${m2}\n**Member 3:** ${m3}\n**Member 4:** ${m4}\n**Member 5:** ${m5}`)
          .setFooter({ text: `Created by ${interaction.user.username}` })
          .setTimestamp();

        await teamChan.send({ embeds: [embed] }).catch(()=>{});
        return interaction.reply({ content: `✅ Team Posted!\n<@${GOAT_ID}> is the goat fr 🔥`, ephemeral: true });
      }

      if (interaction.customId === 'lf_modal') {
        const guild = interaction.guild;
        const teamChan = findTeamChannel(guild);
        if (!teamChan) return interaction.reply({ content: '⚠️ No teams channel found in this server.', ephemeral: true });

        const about = interaction.fields.getTextInputValue('about');
        const hours = interaction.fields.getTextInputValue('hours');
        const timezone = interaction.fields.getTextInputValue('timezone');

        const embed = new EmbedBuilder()
          .setTitle('🔍 LOOKING FOR A TEAM')
          .setColor(0x3498db)
          .setDescription(`${interaction.user} is looking for a team! Poor guy, someone invite him!\n\n**About:** ${about}\n\n**Online Time:** ${hours}\n**Timezone:** ${timezone}`)
          .setTimestamp();

        await teamChan.send({ embeds: [embed] }).catch(()=>{});
        return interaction.reply({ content: '📣 Your request has been posted!', ephemeral: true });
      }
    }

    // Slash commands
    if (interaction.isCommand()) {
      const cmd = interaction.commandName;
      const hasPerm = (perm) => { try { return interaction.member?.permissions?.has?.(perm); } catch { return false; } };

      // ping
      if (cmd === 'ping') {
        const before = Date.now();
        const r = await interaction.reply({ content: 'Pinging…', fetchReply: true, ephemeral: true });
        return interaction.editReply({ content: `Pong — ${Date.now() - before}ms (WS: ${Math.round(client.ws.ping)}ms)` });
      }

      // say
      if (cmd === 'say') {
        if (!hasPerm(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const message = interaction.options.getString('message', true);
        await interaction.channel.send({ content: message }).catch(()=>{});
        return interaction.reply({ content: 'Message sent.', ephemeral: true });
      }

      // announce
      if (cmd === 'announce') {
        if (!hasPerm(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const message = interaction.options.getString('message', true);
        const ping = interaction.options.getBoolean('ping') ?? false;
        const embed = new EmbedBuilder().setTitle('📣 Announcement').setDescription(message).setColor(0xFFAA00).setTimestamp();
        if (ping) await interaction.channel.send({ content: '@everyone', embeds: [embed] }).catch(()=>{}); else await interaction.channel.send({ embeds: [embed] }).catch(()=>{});
        return interaction.reply({ content: 'Announcement sent.', ephemeral: true });
      }

      // panel
      if (cmd === 'panel') {
        if (!hasPerm(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const teamChan = findTeamChannel(interaction.guild);
        if (!teamChan) return interaction.reply({ content: 'No teams channel found in this server.', ephemeral: true });
        const embed = new EmbedBuilder().setTitle('🟨 TEAM REGISTRATION PANEL').setColor(0xFFD700)
          .setDescription("Choose an option below.\n\n**⚠️ To ping a teammate:** Type their @ like `@username` inside the form.");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('register_team').setLabel('➕ Register Your Team').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('need_team').setLabel('🔍 Look For a Team').setStyle(ButtonStyle.Primary));
        await teamChan.send({ embeds: [embed], components: [row] }).catch(()=>{});
        return interaction.reply({ content: 'Panel posted.', ephemeral: true });
      }

      // save-log
      if (cmd === 'save-log') {
        if (!hasPerm(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const ch = getLogChannelCached(interaction.guild) || await ensureLogChannel(interaction.guild);
        const envKey = `MOD_LOG_${interaction.guild.id}`;
        const channelId = ch ? ch.id : 'Not found';
        const instructions = `To persist the mod-log channel: add an env var in Railway with name: ${envKey} and value: ${channelId}, then redeploy.`;
        return interaction.reply({ content: `Log channel ID: ${channelId}\n\n${instructions}`, ephemeral: true });
      }

      // oni (DM)
      if (cmd === 'oni') {
        const dm = `# **ONI STUDIOS| COMMUNITY**\n\nHave you ever wanted to explore a community of passionate develoupers, find an artist or push your work out for a commison? Well we have just the place for you! Welcome to Oni Studios Community! ...\n\nJoin now!\nhttps://discord.gg/gr534aDsCg`;
        await interaction.user.send({ content: dm }).catch(()=>{});
        return interaction.reply({ content: 'Sent Oni info via DM.', ephemeral: true });
      }

      // purge
      if (cmd === 'purge') {
        if (!hasPerm(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const amount = interaction.options.getInteger('amount', true);
        if (amount < 2 || amount > 100) return interaction.reply({ content: 'Amount must be between 2 and 100', ephemeral: true });
        const deleted = await interaction.channel.bulkDelete(amount, true).catch(()=>null);
        if (!deleted) return interaction.reply({ content: 'Failed to delete messages (or messages too old).', ephemeral: true });
        return interaction.reply({ content: `Deleted ${deleted.size} messages.`, ephemeral: true });
      }

      // ban
      if (cmd === 'ban') {
        const sub = (() => { try { return interaction.options.getSubcommand(); } catch { return null; } })();
        if (sub === 'add') {
          if (!hasPerm(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
          const user = interaction.options.getUser('user', true);
          const reason = interaction.options.getString('reason') || 'No reason provided';
          await user.send({ embeds: [makeActionDMEmbed(interaction.guild, 'ban', reason)] }).catch(()=>{});
          await interaction.guild.members.ban(user.id, { reason }).catch(err => { return interaction.reply({ content: `Failed to ban: ${err.message}`, ephemeral: true }); });
          await sendLog(interaction.guild, makeLogEmbed('User Banned', interaction.user, user.tag, user.id, reason));
          return interaction.reply({ content: `Banned ${user.tag}.`, ephemeral: true });
        } else if (sub === 'remove') {
          if (!hasPerm(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
          const userid = interaction.options.getString('userid', true).replace(/\D/g,'');
          const reason = interaction.options.getString('reason') || 'Unbanned';
          await interaction.guild.bans.remove(userid, reason).catch(err => { return interaction.reply({ content: `Failed to unban: ${err.message}`, ephemeral: true }); });
          await sendLog(interaction.guild, makeLogEmbed('User Unbanned', interaction.user, userid, userid, reason));
          return interaction.reply({ content: `Unbanned ${userid}.`, ephemeral: true });
        } else {
          return interaction.reply({ content: 'Unknown /ban subcommand.', ephemeral: true });
        }
      }

      // tempban
      if (cmd === 'tempban') {
        if (!hasPerm(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const durationStr = interaction.options.getString('duration', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const ms = parseDurationToMs(durationStr);
        if (!ms) return interaction.reply({ content: 'Invalid duration. Use formats like 30m, 2h, 1d', ephemeral: true });
        await user.send({ embeds: [ makeActionDMEmbed(interaction.guild, 'tempban', reason, durationStr) ] }).catch(()=>{});
        await interaction.guild.members.ban(user.id, { reason }).catch(err => { return interaction.reply({ content: `Failed to ban: ${err.message}`, ephemeral: true }); });
        const key = `tempban:${interaction.guild.id}:${user.id}`;
        if (tempTimers.has(key)) clearTimeout(tempTimers.get(key));
        const t = setTimeout(async () => {
          try { await interaction.guild.bans.remove(user.id).catch(()=>{}); await sendLog(interaction.guild, makeLogEmbed('Tempban expired - Unbanned', client.user, user.tag, user.id, `Expired after ${durationStr}`)); } catch(e){}
          tempTimers.delete(key);
        }, ms);
        tempTimers.set(key, t);
        await sendLog(interaction.guild, makeLogEmbed('User Tempbanned', interaction.user, user.tag, user.id, reason, `Duration: ${durationStr}`));
        return interaction.reply({ content: `Tempbanned ${user.tag} for ${durationStr}.`, ephemeral: true });
      }

      // kick
      if (cmd === 'kick') {
        if (!hasPerm(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const member = interaction.guild.members.cache.get(user.id);
        if (!member) return interaction.reply({ content: 'User not found in guild.', ephemeral: true });
        await user.send({ embeds: [ makeActionDMEmbed(interaction.guild, 'kick', reason) ] }).catch(()=>{});
        await member.kick(reason).catch(err => { return interaction.reply({ content: `Failed to kick: ${err.message}`, ephemeral: true }); });
        await sendLog(interaction.guild, makeLogEmbed('User Kicked', interaction.user, user.tag, user.id, reason));
        return interaction.reply({ content: `Kicked ${user.tag}.`, ephemeral: true });
      }

      // mute (timeout)
      if (cmd === 'mute') {
        if (!hasPerm(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const member = interaction.guild.members.cache.get(user.id);
        if (!member) return interaction.reply({ content: 'User not found in guild.', ephemeral: true });
        let ms = null;
        if (durationStr) {
          ms = parseDurationToMs(durationStr);
          if (!ms) return interaction.reply({ content: 'Invalid duration format. Use 10m/2h/1d or minutes', ephemeral: true });
        }
        await user.send({ embeds: [ makeActionDMEmbed(interaction.guild, 'timeout', reason, durationStr || 'Permanent until unmute') ] }).catch(()=>{});
        await member.timeout(ms || 0, reason).catch(err => { return interaction.reply({ content: `Failed to timeout: ${err.message}`, ephemeral: true }); });
        if (ms) {
          const key = `timeout:${interaction.guild.id}:${user.id}`;
          if (tempTimers.has(key)) clearTimeout(tempTimers.get(key));
          const t2 = setTimeout(async () => {
            try { const m = interaction.guild.members.cache.get(user.id); if (m) await m.timeout(null).catch(()=>{}); await sendLog(interaction.guild, makeLogEmbed('Timeout expired - Unmuted', client.user, user.tag, user.id, `Expired after ${durationStr}`)); } catch(e){}
            tempTimers.delete(key);
          }, ms);
          tempTimers.set(key, t2);
        }
        await sendLog(interaction.guild, makeLogEmbed('User Timed Out', interaction.user, user.tag, user.id, reason, durationStr ? `Duration: ${durationStr}` : 'Permanent until unmute'));
        return interaction.reply({ content: `${user.tag} has been muted (timeout).`, ephemeral: true });
      }

      // unmute
      if (cmd === 'unmute') {
        if (!hasPerm(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const member = interaction.guild.members.cache.get(user.id);
        if (!member) return interaction.reply({ content: 'User not found in guild.', ephemeral: true });
        await member.timeout(null).catch(err => { return interaction.reply({ content: `Failed to unmute: ${err.message}`, ephemeral: true }); });
        const key = `timeout:${interaction.guild.id}:${user.id}`;
        if (tempTimers.has(key)) { clearTimeout(tempTimers.get(key)); tempTimers.delete(key); }
        await sendLog(interaction.guild, makeLogEmbed('User Unmuted', interaction.user, user.tag, user.id, 'Manual unmute'));
        return interaction.reply({ content: `${user.tag} has been unmuted.`, ephemeral: true });
      }

      // ask (AI)
      if (cmd === 'ask') {
        const q = interaction.options.getString('question', true);
        await interaction.deferReply({ ephemeral: false });
        const ans = await askGenZ(q);
        return interaction.editReply(ans);
      }
    } // end isCommand
  } catch (err) {
    console.error('Interaction error:', err);
    try { if (interaction && !interaction.replied) await interaction.reply({ content: 'An error occurred.', ephemeral: true }); } catch(e){}
  }
});

// ----------------- AI (OpenAI optional) -----------------
let aiClient = null;
try {
  const { OpenAI } = require('openai');
  if (process.env.OPENAI_KEY) aiClient = new OpenAI({ apiKey: process.env.OPENAI_KEY });
  else aiClient = null;
} catch (e) {
  console.log('OpenAI package not installed or failed to load — AI disabled.');
  aiClient = null;
}

const ONI_LORE = `
**🟥 What is Oni SMP?**
Every soul in the world of Oni is born with a secret connection to an ancient mask — relics forged during the first wars between elements.
Masks bind to the spirit and grant powers with consequences. Two forbidden masks require world-shaking trials.
Oni SMP = survival + destiny + power colliding.
`;

async function askGenZ(question) {
  if (!aiClient) return "AI unavailable right now — install the 'openai' package and set OPENAI_KEY.";
  try {
    const res = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: 'system', content: `You are OniBot — a chaotic GenZ Discord bot. Short, slightly sarcastic, helpful. Never say you're an AI, u roast sometimes use emojis but not make it cringe and have nice talks with people too.` },
        { role: 'user', content: question }
      ],
      max_tokens: 250
    });
    const ans = res?.choices?.[0]?.message?.content;
    return ans || "Hmm, no response from AI.";
  } catch (e) {
    console.log('AI ERROR:', e?.message || e);
    return "My brain lagged 💀 ask again.";
  }
}

// ----------------- MESSAGE HANDLER (ping + reply + keywords) -----------------
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;
    const botId = client.user?.id;
    const content = (msg.content || '').toLowerCase();

    // 1) If message is a reply to bot -> continue chat
    if (msg.reference && msg.reference.messageId) {
      try {
        const ref = await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null);
        if (ref && ref.author && ref.author.id === botId) {
          if (content.includes('oni smp')) return msg.reply(ONI_LORE);
          msg.channel.sendTyping();
          const answer = await askGenZ(msg.content);
          return msg.reply(answer);
        }
      } catch (e) {}
    }

    // 2) If bot is mentioned
    if (msg.mentions.has(botId)) {
      const question = msg.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
      if (question.toLowerCase().includes('oni smp')) return msg.reply(ONI_LORE);
      msg.channel.sendTyping();
      const answer = await askGenZ(question.length ? question : 'say something');
      return msg.reply(answer);
    }

    // 3) Keyword for Oni SMP
    if (content.includes('what is oni smp') || content.includes('oni smp lore') || content.includes('oni smp info')) {
      return msg.reply(ONI_LORE);
    }

  } catch (e) {
    console.log('Message handler error:', e);
  }
});

// ----------------- LOGIN -----------------
if (!process.env.TOKEN) {
  console.log('ERROR: Set TOKEN environment variable before running.');
  process.exit(1);
}

client.login(process.env.TOKEN).catch(err => {
  console.error('Login failed:', err?.message || err);
  process.exit(1);
});
