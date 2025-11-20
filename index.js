// FINAL index.js — Teams + Moderation (single-file, hybrid commands, topic-based log persistence)
// Do NOT put your token here. Set env var: TOKEN
// Node 18+, discord.js v14+

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
  PermissionFlagsBits,
} = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---------------- CONFIG ----------------
const TEAMS_CHANNEL_NAME = "🫂┃teams";
const FALLBACK_CHANNEL_IDS = [
  "1389976721704489010",
  "1425816192794029058" // (note: keep your real fallbacks here if needed)
];

// Guild IDs that should receive instant (guild) command registration
const INSTANT_GUILD_IDS = [
  "1361474123972481086",
  "1368328809861873664",
  "1368618794767089816",
  "1414997585080356927",
  "1425669546794029058",
  "1427364420098723974"
];

// Goat ping (ephemeral fun)
const GOAT_ID = "1094566631281270814";

// data.json (not relied on for log persistence — channel topic is used)
const DATA_PATH = path.join(__dirname, 'data.json');
let DATA = {};
try {
  if (fs.existsSync(DATA_PATH)) DATA = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}');
} catch (e) { DATA = {}; }
function saveData() {
  try { fs.writeFileSync(DATA_PATH, JSON.stringify(DATA, null, 2)); } catch (e) {}
}

// in-memory timers (for tempban / scheduled unban / auto-unmute)
const tempTimers = new Map(); // key like `tempban:<guildId>:<userId>` -> timeout

// ---------------- HELPERS ----------------
function big(text) {
  return `**__${String(text).toUpperCase()}__**`;
}

function findTeamChannelByGuild(guild) {
  // 1) by name
  const byName = guild.channels.cache.find(c => c.name === TEAMS_CHANNEL_NAME);
  if (byName) return byName;
  // 2) fallback by provided IDs
  for (const id of FALLBACK_CHANNEL_IDS) {
    const ch = guild.channels.cache.get(id);
    if (ch) return ch;
  }
  return null;
}

// Moderation log channel ensure + persistence via channel topic
async function ensureLogChannel(guild) {
  const envKey = `MOD_LOG_${guild.id}`;
  // 1) check env var
  const envVal = process.env[envKey];
  if (envVal) {
    const ch = guild.channels.cache.get(envVal);
    if (ch) return ch;
  }

  // 2) find channel whose topic contains our marker
  const topicMarker = `__MOD_LOG__:${guild.id}`;
  const byTopic = guild.channels.cache.find(c => c.topic && c.topic.includes(topicMarker));
  if (byTopic) return byTopic;

  // 3) find by name '🔒┃moderation-logs'
  const byName = guild.channels.cache.find(c => c.name === '🔒┃moderation-logs');
  if (byName) {
    // Set topic marker if missing
    if (!byName.topic || !byName.topic.includes('__MOD_LOG__')) {
      try { await byName.setTopic(`${byTopic ? byTopic.topic + ' ' : ''}${topicMarker}`); } catch (e) {}
    }
    return byName;
  }

  // 4) create channel and set topic marker
  try {
    const created = await guild.channels.create({
      name: '🔒┃moderation-logs',
      type: 0, // text
      reason: 'Auto-created moderation log channel'
    });
    try { await created.setTopic(topicMarker); } catch (e) {}
    // store fallback in local DATA
    DATA.logChannels = DATA.logChannels || {};
    DATA.logChannels[guild.id] = created.id;
    saveData();
    // DM owner with instructions to save env var if they want permanent env persistence
    try {
      const owner = await guild.fetchOwner();
      await owner.send(
        `Hi! I auto-created a moderation log channel in your server (${guild.name}).\n` +
        `Channel: ${created.name}\n` +
        `Channel ID: ${created.id}\n\n` +
        `To make this permanent across restarts (recommended), add an environment variable to your Railway project named:\n` +
        `MOD_LOG_${guild.id}\n` +
        `and set its value to the channel ID above.`
      ).catch(() => {});
    } catch (e) {}
    return created;
  } catch (e) {
    console.log(`Failed to create moderation log channel in guild ${guild.id}: ${e?.message || e}`);
    return null;
  }
}

// find mod log channel (env -> topic -> local data -> name)
function getLogChannelFromCache(guild) {
  const envKey = `MOD_LOG_${guild.id}`;
  if (process.env[envKey]) {
    const ch = guild.channels.cache.get(process.env[envKey]);
    if (ch) return ch;
  }
  // topic
  const topicMarker = `__MOD_LOG__:${guild.id}`;
  const byTopic = guild.channels.cache.find(c => c.topic && c.topic.includes(topicMarker));
  if (byTopic) return byTopic;
  // local data fallback
  if (DATA.logChannels && DATA.logChannels[guild.id]) {
    const ch = guild.channels.cache.get(DATA.logChannels[guild.id]);
    if (ch) return ch;
  }
  // by name
  const byName = guild.channels.cache.find(c => c.name === '🔒┃moderation-logs');
  if (byName) return byName;
  return null;
}

function parseDurationToMs(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  // plain number -> minutes
  if (/^\d+$/.test(s)) return parseInt(s,10) * 60_000;
  const m = s.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60_000;
  if (unit === 'h') return n * 60_000 * 60;
  if (unit === 'd') return n * 60_000 * 60 * 24;
  return null;
}

// medium roast DM embed for bans/timeouts
function makeBanDMEmbed(guild, action, reason, durationStr=null) {
  const title = action === 'ban' ? 'You have been banned' : (action === 'tempban' ? 'You have been temp-banned' : 'You have been timed out');
  const roastLines = [
    "Maybe the real griefing was the mistakes you made.",
    "You tried. The server didn't agree. It's not you, it's your playskill.",
    "Go practice in singleplayer and come back when you can behave."
  ];
  const roast = roastLines[Math.floor(Math.random()*roastLines.length)];
  const descParts = [];
  descParts.push(`**Server:** ${guild.name}`);
  if (durationStr) descParts.push(`**Duration:** ${durationStr}`);
  descParts.push(`**Reason:** ${reason || 'No reason provided'}`);
  descParts.push(`\n_${roast}_`);
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(descParts.join('\n'))
    .setColor(0xFF4444)
    .setTimestamp();
  return embed;
}

// log embed builder
function makeLogEmbed(action, moderator, targetTag, targetId, reason, extra='') {
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

// send log if possible
async function sendLog(guild, embed) {
  try {
    let ch = getLogChannelFromCache(guild);
    if (!ch) ch = await ensureLogChannel(guild);
    if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) { /* ignore */ }
}

// ---------------- COMMANDS DEFINITION ----------------
const commands = [
  // ban as subcommands add/remove
  {
    name: 'ban',
    description: 'Ban management',
    options: [
      { name: 'add', type: 1, description: 'Ban a user', options: [
        { name: 'user', type: 6, required: true, description: 'User to ban' },
        { name: 'reason', type: 3, required: false, description: 'Reason' }
      ]},
      { name: 'remove', type: 1, description: 'Unban a user', options: [
        { name: 'userid', type: 3, required: true, description: 'User ID to unban' },
        { name: 'reason', type: 3, required: false, description: 'Reason' }
      ]}
    ],
    default_member_permissions: String(PermissionFlagsBits.BanMembers)
  },
  // tempban
  {
    name: 'tempban',
    description: 'Ban a user for a limited time (e.g. 1d, 2h, 30m)',
    options: [
      { name: 'user', type: 6, required: true, description: 'User to temp-ban' },
      { name: 'duration', type: 3, required: true, description: 'Duration like 30m, 2h, 1d' },
      { name: 'reason', type: 3, required: false, description: 'Reason' }
    ],
    default_member_permissions: String(PermissionFlagsBits.BanMembers)
  },
  {
    name: 'kick',
    description: 'Kick a user',
    options: [
      { name: 'user', type: 6, required: true, description: 'User to kick' },
      { name: 'reason', type: 3, required: false }
    ],
    default_member_permissions: String(PermissionFlagsBits.KickMembers)
  },
  {
    name: 'mute',
    description: 'Timeout (mute) a user using Discord timeout',
    options: [
      { name: 'user', type: 6, required: true },
      { name: 'duration', type: 3, required: false, description: 'Duration e.g. 10m, 2h (if empty, permanent until unmute)' },
      { name: 'reason', type: 3, required: false }
    ],
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers)
  },
  {
    name: 'unmute',
    description: 'Remove timeout from a user',
    options: [{ name: 'user', type: 6, required: true }],
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers)
  },
  {
    name: 'kick',
    description: 'Kick a user', // duplicate handled above but keep safe
    options: [
      { name: 'user', type: 6, required: true },
      { name: 'reason', type: 3 }
    ],
    default_member_permissions: String(PermissionFlagsBits.KickMembers)
  },
  {
    name: 'purge',
    description: 'Bulk delete messages (2-100)',
    options: [{ name: 'amount', type: 4, required: true }],
    default_member_permissions: String(PermissionFlagsBits.ManageMessages)
  },
  {
    name: 'say',
    description: 'Bot says something in current channel',
    options: [{ name: 'message', type: 3, required: true }],
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },
  {
    name: 'announce',
    description: 'Announce an embed (optionally ping @everyone)',
    options: [
      { name: 'message', type: 3, required: true },
      { name: 'ping', type: 5, required: false }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },
  {
    name: 'ping',
    description: 'Bot latency'
  },
  {
    name: 'oni',
    description: 'Oni commands',
    options: [
      { name: 'info', type: 1, description: 'Show Oni Studios info' }
    ]
  },
  {
    name: 'panel',
    description: 'Repost the team registration panel (mod-only)',
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },
  {
    name: 'save-log',
    description: 'Show the moderation log ID and instructions (mod-only)',
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  }
];

// ---------------- REGISTER COMMANDS (hybrid) ----------------
async function registerCommands() {
  if (!process.env.TOKEN) {
    console.log('No TOKEN env var - skipping command registration');
    return;
  }
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    console.log('Registering global commands (may take up to 1 hour)...');
    const appId = (await client.application.fetch()).id;
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log('Global registration requested.');
  } catch (e) {
    console.log('Global register error:', e?.message || e);
  }

  // register in instant guilds
  for (const gid of INSTANT_GUILD_IDS) {
    try {
      const appId = (await client.application.fetch()).id;
      await rest.put(Routes.applicationGuildCommands(appId, gid), { body: commands });
      console.log(`Registered guild commands for ${gid}`);
    } catch (e) {
      console.log(`Guild register error ${gid}:`, e?.message || e);
    }
  }
}

// ---------------- READY ----------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // register commands
  registerCommands().catch(() => {});

  // Post panel to all guilds where team channel exists (do not delete old messages)
  client.guilds.cache.forEach(async (guild) => {
    try {
      const teamChan = findTeamChannelByGuild(guild);
      if (!teamChan) {
        console.log(`No teams channel in ${guild.name} (${guild.id})`);
      } else {
        const embed = new EmbedBuilder()
          .setTitle("🟨 **TEAM REGISTRATION PANEL**")
          .setColor(0xFFD700)
          .setDescription("Choose an option below.\n\n**⚠️ To ping a teammate:**\nType their @ like `@username` inside the form.");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("register_team").setLabel("➕ Register Your Team").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("need_team").setLabel("🔍 Look For a Team").setStyle(ButtonStyle.Primary)
        );
        await teamChan.send({ embeds: [embed], components: [row] }).catch(() => {});
      }

      // ensure mod log channel exists (topic based persistence)
      await ensureLogChannel(guild).catch(() => {});
    } catch (e) {
      console.log('Startup error for guild', guild.id, e?.message || e);
    }
  });
});

// ---------------- INTERACTIONS ----------------
client.on('interactionCreate', async (interaction) => {
  try {
    // BUTTONS
    if (interaction.isButton()) {
      // register team
      if (interaction.customId === 'register_team') {
        const modal = new ModalBuilder().setCustomId('team_modal').setTitle('Register Your Team');
        const teamName = new TextInputBuilder().setCustomId('team_name').setLabel('📝 Team Name (Required)').setStyle(TextInputStyle.Short).setRequired(true);
        const m1 = new TextInputBuilder().setCustomId('m1').setLabel('⭐ Member 1').setStyle(TextInputStyle.Short).setRequired(true);
        const m2 = new TextInputBuilder().setCustomId('m2').setLabel('Member 2 (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
        const m3 = new TextInputBuilder().setCustomId('m3').setLabel('Member 3 (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
        const m45 = new TextInputBuilder().setCustomId('m45').setLabel('Members 4 & 5 (comma separated)').setStyle(TextInputStyle.Short).setRequired(false);
        modal.addComponents(
          new ActionRowBuilder().addComponents(teamName),
          new ActionRowBuilder().addComponents(m1),
          new ActionRowBuilder().addComponents(m2),
          new ActionRowBuilder().addComponents(m3),
          new ActionRowBuilder().addComponents(m45)
        );
        return interaction.showModal(modal);
      }

      // need team
      if (interaction.customId === 'need_team') {
        const modal = new ModalBuilder().setCustomId('lf_modal').setTitle('Looking For a Team');
        const about = new TextInputBuilder().setCustomId('about').setLabel('What are your cool things / about you?').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const hours = new TextInputBuilder().setCustomId('hours').setLabel('How long will you be online?').setStyle(TextInputStyle.Short).setRequired(true);
        const timezone = new TextInputBuilder().setCustomId('timezone').setLabel('Timezone (e.g. IST)').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(
          new ActionRowBuilder().addComponents(about),
          new ActionRowBuilder().addComponents(hours),
          new ActionRowBuilder().addComponents(timezone)
        );
        return interaction.showModal(modal);
      }
    }

    // MODAL SUBMITS
    if (interaction.isModalSubmit()) {
      // team registration
      if (interaction.customId === 'team_modal') {
        const guild = interaction.guild;
        const teamChan = findTeamChannelByGuild(guild);
        if (!teamChan) {
          await interaction.reply({ content: '⚠️ No teams channel found in this server.', ephemeral: true });
          return;
        }
        const name = interaction.fields.getTextInputValue('team_name');
        const m1 = interaction.fields.getTextInputValue('m1');
        const m2 = interaction.fields.getTextInputValue('m2') || '—';
        const m3 = interaction.fields.getTextInputValue('m3') || '—';
        const raw45 = interaction.fields.getTextInputValue('m45') || '';
        let m4 = '—', m5 = '—';
        if (raw45.includes(',')) {
          const parts = raw45.split(',').map(s => s.trim());
          m4 = parts[0] || '—';
          m5 = parts[1] || '—';
        } else if (raw45.trim()) {
          m4 = raw45.trim();
        }
        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${big(name)}`)
          .setColor(0x00FF66)
          .setDescription(
            `**Member 1:** ${m1}\n` +
            `**Member 2:** ${m2}\n` +
            `**Member 3:** ${m3}\n` +
            `**Member 4:** ${m4}\n` +
            `**Member 5:** ${m5}`
          )
          .setFooter({ text: `Created by ${interaction.user.username}` })
          .setTimestamp();
        await teamChan.send({ embeds: [embed] }).catch(() => {});
        await interaction.reply({ content: `✅ Team Posted!\n<@${GOAT_ID}> is the goat fr 🔥`, ephemeral: true });
        return;
      }

      // looking for team modal
      if (interaction.customId === 'lf_modal') {
        const guild = interaction.guild;
        const teamChan = findTeamChannelByGuild(guild);
        if (!teamChan) {
          await interaction.reply({ content: '⚠️ No teams channel found in this server.', ephemeral: true });
          return;
        }
        const about = interaction.fields.getTextInputValue('about');
        const hours = interaction.fields.getTextInputValue('hours');
        const timezone = interaction.fields.getTextInputValue('timezone');
        const embed = new EmbedBuilder()
          .setTitle('🔍 **LOOKING FOR A TEAM**')
          .setColor(0x3498db)
          .setDescription(`${interaction.user} is looking for a team! Poor guy, someone invite him!\n\n**About:** ${about}\n\n**Online Time:** ${hours}\n**Timezone:** ${timezone}`)
          .setTimestamp();
        await teamChan.send({ embeds: [embed] }).catch(() => {});
        await interaction.reply({ content: '📣 Your request has been posted!', ephemeral: true });
        return;
      }
    }

    // SLASH COMMANDS
    if (interaction.isCommand()) {
      const name = interaction.commandName;

      const hasPerm = (perm) => {
        try { return interaction.member?.permissions?.has?.(perm); } catch { return false; }
      };

      // PING
      if (name === 'ping') {
        const before = Date.now();
        await interaction.reply({ content: 'Pinging…', fetchReply: true, ephemeral: true });
        const latency = Date.now() - before;
        return interaction.editReply({ content: `Pong — ${latency}ms (WS: ${Math.round(client.ws.ping)}ms)` });
      }

      // SAY
      if (name === 'say') {
        if (!hasPerm(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const message = interaction.options.getString('message', true);
        await interaction.channel.send({ content: message }).catch(() => {});
        return interaction.reply({ content: 'Message sent.', ephemeral: true });
      }

      // ANNOUNCE
      if (name === 'announce') {
        if (!hasPerm(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const message = interaction.options.getString('message', true);
        const ping = interaction.options.getBoolean('ping') ?? false;
        const embed = new EmbedBuilder().setTitle('📣 Announcement').setDescription(message).setColor(0xFFAA00).setTimestamp();
        if (ping) await interaction.channel.send({ content: '@everyone', embeds: [embed] }).catch(()=>{});
        else await interaction.channel.send({ embeds: [embed] }).catch(()=>{});
        return interaction.reply({ content: 'Announcement sent.', ephemeral: true });
      }

      // PANEL
      if (name === 'panel') {
        if (!hasPerm(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const teamChan = findTeamChannelByGuild(interaction.guild);
        if (!teamChan) return interaction.reply({ content: 'No teams channel found in this server.', ephemeral: true });
        const embed = new EmbedBuilder().setTitle('🟨 **TEAM REGISTRATION PANEL**').setColor(0xFFD700).setDescription("Choose an option below.\n\n**⚠️ To ping a teammate:** Type their @ like `@username` inside the form.");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('register_team').setLabel('➕ Register Your Team').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('need_team').setLabel('🔍 Look For a Team').setStyle(ButtonStyle.Primary));
        await teamChan.send({ embeds: [embed], components: [row] }).catch(() => {});
        return interaction.reply({ content: 'Panel posted.', ephemeral: true });
      }

      // SAVE-LOG helper
      if (name === 'save-log') {
        if (!hasPerm(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const logCh = getLogChannelFromCache(interaction.guild) || await ensureLogChannel(interaction.guild);
        const envKey = `MOD_LOG_${interaction.guild.id}`;
        const channelId = logCh ? logCh.id : 'Not found';
        const instructions = `To persist the moderation log channel permanently, add an environment variable in Railway:\nName: ${envKey}\nValue: ${channelId}\n\nAfter saving, redeploy your Railway project.`;
        return interaction.reply({ content: `Log channel ID: ${channelId}\n\n${instructions}`, ephemeral: true });
      }

      // ONI INFO -> DM the user your big text
      if (name === 'oni') {
        // send DM
        const dmContent = `# **ONI STUDIOS| COMMUNITY**\n\nHave you ever wanted to explore a community of passionate develoupers, find an artist or push your work out for a commison? Well we have just the place for you! Welcome to Oni Studios Community! Where you can meet with other like minded people, publish your art for potential commisons show off work of your programing or check out and stay updated on all things Oni Studios! Ranging from Oni SMP Zodiac SMP and Hunter SMP! We welcome you to our community stay updated on **everything** or maybe find a new smp to make content on! whatever the cause, we got it for **you**\n\nJoin now!\nhttps://discord.gg/gr534aDsCg`;
        await interaction.user.send({ content: dmContent }).catch(() => {});
        return interaction.reply({ content: 'Sent Oni info via DM.', ephemeral: true });
      }

      // PURGE
      if (name === 'purge') {
        if (!hasPerm(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const amount = interaction.options.getInteger('amount', true);
        if (amount < 2 || amount > 100) return interaction.reply({ content: 'Amount must be between 2 and 100', ephemeral: true });
        const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
        if (!deleted) return interaction.reply({ content: 'Failed to delete messages (or messages too old).', ephemeral: true });
        return interaction.reply({ content: `Deleted ${deleted.size} messages.`, ephemeral: true });
      }

      // BAN subcommands (add/remove)
      if (name === 'ban') {
        // find which subcommand
        const sub = interaction.options.getSubcommand(false);
        if (sub === 'add') {
          if (!hasPerm(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
          const user = interaction.options.getUser('user', true);
          const reason = interaction.options.getString('reason') || 'No reason provided';
          // DM target
          try {
            await user.send({ embeds: [ makeBanDMEmbed(interaction.guild, 'ban', reason) ] }).catch(()=>{});
          } catch (e) {}
          // ban
          await interaction.guild.members.ban(user.id, { reason }).catch(err => {
            return interaction.reply({ content: `Failed to ban: ${err.message}`, ephemeral: true });
          });
          // log
          await sendLog(interaction.guild, makeLogEmbed('User Banned', interaction.user, user.tag, user.id, reason));
          return interaction.reply({ content: `Banned ${user.tag}.`, ephemeral: true });
        } else if (sub === 'remove') {
          if (!hasPerm(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
          const userid = interaction.options.getString('userid', true).replace(/\D/g,'');
          const reason = interaction.options.getString('reason') || 'Unbanned';
          // unban
          await interaction.guild.bans.remove(userid, reason).catch(err => {
            return interaction.reply({ content: `Failed to unban: ${err.message}`, ephemeral: true });
          });
          // log
          await sendLog(interaction.guild, makeLogEmbed('User Unbanned', interaction.user, userid, userid, reason));
          return interaction.reply({ content: `Unbanned ${userid}.`, ephemeral: true });
        } else {
          return interaction.reply({ content: 'Unknown subcommand for /ban', ephemeral: true });
        }
      }

      // TEMPBAN
      if (name === 'tempban') {
        if (!hasPerm(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const durationStr = interaction.options.getString('duration', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const ms = parseDurationToMs(durationStr);
        if (!ms) return interaction.reply({ content: 'Invalid duration format. Use formats like 30m, 2h, 1d', ephemeral: true });

        try {
          await user.send({ embeds: [ makeBanDMEmbed(interaction.guild, 'tempban', reason, durationStr) ] }).catch(()=>{});
        } catch (e) {}
        // ban
        await interaction.guild.members.ban(user.id, { reason }).catch(err => {
          return interaction.reply({ content: `Failed to ban: ${err.message}`, ephemeral: true });
        });
        // schedule unban
        const key = `tempban:${interaction.guild.id}:${user.id}`;
        if (tempTimers.has(key)) clearTimeout(tempTimers.get(key));
        const t = setTimeout(async () => {
          try { await interaction.guild.bans.remove(user.id).catch(()=>{}); await sendLog(interaction.guild, makeLogEmbed('Tempban expired - Unbanned', client.user, user.tag, user.id, `Expired after ${durationStr}`)); } catch(e) {}
          tempTimers.delete(key);
        }, ms);
        tempTimers.set(key, t);
        // log
        await sendLog(interaction.guild, makeLogEmbed('User Tempbanned', interaction.user, user.tag, user.id, reason, `Duration: ${durationStr}`));
        return interaction.reply({ content: `Tempbanned ${user.tag} for ${durationStr}.`, ephemeral: true });
      }

      // KICK
      if (name === 'kick') {
        if (!hasPerm(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const member = interaction.guild.members.cache.get(user.id);
        if (!member) return interaction.reply({ content: 'User not found in guild.', ephemeral: true });
        try {
          await user.send({ embeds: [ makeBanDMEmbed(interaction.guild, 'kick', reason) ] }).catch(()=>{});
        } catch (e) {}
        await member.kick(reason).catch(err => {
          return interaction.reply({ content: `Failed to kick: ${err.message}`, ephemeral: true });
        });
        await sendLog(interaction.guild, makeLogEmbed('User Kicked', interaction.user, user.tag, user.id, reason));
        return interaction.reply({ content: `Kicked ${user.tag}.`, ephemeral: true });
      }

      // MUTE (timeout)
      if (name === 'mute') {
        if (!hasPerm(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const member = interaction.guild.members.cache.get(user.id);
        if (!member) return interaction.reply({ content: 'User not found in guild.', ephemeral: true });
        let ms = null;
        if (durationStr) {
          ms = parseDurationToMs(durationStr);
          if (!ms) return interaction.reply({ content: 'Invalid duration (use 10m/2h/1d or minutes).', ephemeral: true });
        }
        // Discord timeout uses ms (0 to remove)
        try {
          await user.send({ embeds: [ makeBanDMEmbed(interaction.guild, 'timeout', reason, durationStr || 'Permanent until unmute') ] }).catch(()=>{});
        } catch (e) {}
        await member.timeout(ms || 0, reason).catch(err => {
          return interaction.reply({ content: `Failed to timeout: ${err.message}`, ephemeral: true });
        });

        // schedule unmute in-memory (optional, only if duration)
        if (ms) {
          const key = `timeout:${interaction.guild.id}:${user.id}`;
          if (tempTimers.has(key)) clearTimeout(tempTimers.get(key));
          const t = setTimeout(async () => {
            try { const m = interaction.guild.members.cache.get(user.id); if (m) await m.timeout(null).catch(()=>{}); await sendLog(interaction.guild, makeLogEmbed('Timeout expired - Unmuted', client.user, user.tag, user.id, `Expired after ${durationStr}`)); } catch(e) {}
            tempTimers.delete(key);
          }, ms);
          tempTimers.set(key, t);
        }

        await sendLog(interaction.guild, makeLogEmbed('User Timed Out', interaction.user, user.tag, user.id, reason, durationStr ? `Duration: ${durationStr}` : 'Permanent until unmute'));
        return interaction.reply({ content: `${user.tag} has been muted (timeout).`, ephemeral: true });
      }

      // UNMUTE
      if (name === 'unmute') {
        if (!hasPerm(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: 'No perms.', ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const member = interaction.guild.members.cache.get(user.id);
        if (!member) return interaction.reply({ content: 'User not found in guild.', ephemeral: true });
        await member.timeout(null).catch(err => {
          return interaction.reply({ content: `Failed to unmute: ${err.message}`, ephemeral: true });
        });
        const key = `timeout:${interaction.guild.id}:${user.id}`;
        if (tempTimers.has(key)) { clearTimeout(tempTimers.get(key)); tempTimers.delete(key); }
        await sendLog(interaction.guild, makeLogEmbed('User Unmuted', interaction.user, user.tag, user.id, 'Manual unmute'));
        return interaction.reply({ content: `${user.tag} has been unmuted.`, ephemeral: true });
      }

    } // end isCommand

  } catch (err) {
    console.error('Interaction handler error:', err);
    try { if (interaction && !interaction.replied) await interaction.reply({ content: 'An error occurred.', ephemeral: true }); } catch(e) {}
  }
});

// ---------------- LOGIN ----------------
if (!process.env.TOKEN) {
  console.log('ERROR: Set TOKEN environment variable before running.');
  process.exit(1);
}
client.login(process.env.TOKEN).catch(err => {
  console.error('Login failed:', err?.message || err);
  process.exit(1);
});
