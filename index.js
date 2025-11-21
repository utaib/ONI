// ======================================================

// ======================================================

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
console.log('DEBUG DEEPSEEK_KEY:', process.env.DEEPSEEK_KEY ? 'Loaded ✅' : '❌ MISSING');
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
const GOAT_ID = "1094566631281270814";

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
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 60_000;
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
    "You tried. The server didn't agree 💀",
    "Go practice in singleplayer and come back stronger."
  ];
  const roast = roastLines[Math.floor(Math.random() * roastLines.length)];
  const parts = [];
  parts.push(`**Server:** ${guild?.name || 'Unknown'}`);
  if (durationStr) parts.push(`**Duration:** ${durationStr}`);
  parts.push(`**Reason:** ${reason || 'No reason provided'}`);
  parts.push(`\n_${roast}_`);
  return new EmbedBuilder()
    .setTitle(titles[action] || 'Action taken')
    .setDescription(parts.join('\n'))
    .setColor(0xFF4444)
    .setTimestamp();
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

// ----------------- LOG CHANNEL SYSTEM -----------------
async function ensureLogChannel(guild) {
  const envKey = `MOD_LOG_${guild.id}`;
  if (process.env[envKey]) {
    const ch = guild.channels.cache.get(process.env[envKey]);
    if (ch) return ch;
  }

  const marker = `__MOD_LOG__:${guild.id}`;
  const byTopic = guild.channels.cache.find(
    c => c.topic && c.topic.includes(marker)
  );
  if (byTopic) return byTopic;

  const byName = guild.channels.cache.find(c => c.name === '🔒┃moderation-logs');
  if (byName) return byName;

  try {
    const created = await guild.channels.create({
      name: '🔒┃moderation-logs',
      type: 0,
      reason: 'Auto-created mod log channel'
    });
    DATA.logChannels = DATA.logChannels || {};
    DATA.logChannels[guild.id] = created.id;
    saveData();
    return created;
  } catch (e) {
    console.log("Log channel create error:", e);
    return null;
  }
}

function getLogChannelCached(guild) {
  const envKey = `MOD_LOG_${guild.id}`;
  if (process.env[envKey]) {
    const ch = guild.channels.cache.get(process.env[envKey]);
    if (ch) return ch;
  }
  if (DATA.logChannels?.[guild.id]) {
    const ch = guild.channels.cache.get(DATA.logChannels[guild.id]);
    if (ch) return ch;
  }
  return guild.channels.cache.find(c => c.name === '🔒┃moderation-logs') || null;
}

async function sendLog(guild, embed) {
  let ch = getLogChannelCached(guild);
  if (!ch) ch = await ensureLogChannel(guild);
  if (ch) ch.send({ embeds: [embed] }).catch(()=>{});
}
// ----------------- SLASH COMMAND DEFINITIONS -----------------
const commands = [
  {
    name: 'ban',
    description: 'Ban system',
    options: [
      {
        name: 'add',
        type: 1,
        description: 'Ban a user',
        options: [
          { name: 'user', type: 6, required: true, description: 'User to ban' },
          { name: 'reason', type: 3, required: false, description: 'Reason' }
        ]
      },
      {
        name: 'remove',
        type: 1,
        description: 'Unban a user by ID',
        options: [
          { name: 'userid', type: 3, required: true, description: 'User ID' },
          { name: 'reason', type: 3, required: false, description: 'Reason' }
        ]
      }
    ],
    default_member_permissions: String(PermissionFlagsBits.BanMembers)
  },

  {
    name: 'tempban',
    description: 'Ban temporarily',
    options: [
      { name: 'user', type: 6, required: true, description: 'User' },
      { name: 'duration', type: 3, required: true, description: '30m, 2h, 1d' },
      { name: 'reason', type: 3, required: false, description: 'Reason' }
    ],
    default_member_permissions: String(PermissionFlagsBits.BanMembers)
  },

  {
    name: 'kick',
    description: 'Kick a user',
    options: [
      { name: 'user', type: 6, required: true, description: 'User' },
      { name: 'reason', type: 3, required: false, description: 'Reason' }
    ],
    default_member_permissions: String(PermissionFlagsBits.KickMembers)
  },

  {
    name: 'mute',
    description: 'Timeout a user',
    options: [
      { name: 'user', type: 6, required: true, description: 'User' },
      { name: 'duration', type: 3, required: false, description: '10m / 2h / 1d' },
      { name: 'reason', type: 3, required: false, description: 'Reason' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers)
  },

  {
    name: 'unmute',
    description: 'Remove timeout',
    options: [
      { name: 'user', type: 6, required: true, description: 'User' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers)
  },

  {
    name: 'purge',
    description: 'Bulk delete messages',
    options: [
      { name: 'amount', type: 4, required: true, description: '2–100 messages' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageMessages)
  },

  {
    name: 'say',
    description: 'Make bot talk',
    options: [
      { name: 'message', type: 3, required: true, description: 'Message' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },

  {
    name: 'announce',
    description: 'Send announcement',
    options: [
      { name: 'message', type: 3, required: true, description: 'Message' },
      { name: 'ping', type: 5, required: false, description: 'Ping everyone?' }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },

  { name: 'ping', description: 'Check latency' },

  {
    name: 'oni',
    description: 'Get Oni Studios info',
    options: [
      { name: 'info', type: 1, description: 'Send info' }
    ]
  },

  {
    name: 'panel',
    description: 'Post team panel',
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },

  {
    name: 'save-log',
    description: 'Show log channel settings',
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },

  {
    name: 'ask',
    description: 'Talk to OniBOT AI',
    options: [
      { name: 'question', type: 3, required: true, description: 'Question' }
    ]
  }
];

// ----------------- REGISTERING SLASH COMMANDS -----------------
async function registerCommands() {
  if (!process.env.TOKEN) {
    console.log("TOKEN missing — skipping slash registration");
    return;
  }

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const appId = (await client.application.fetch()).id;

  try {
    await rest.put(
      Routes.applicationCommands(appId),
      { body: commands }
    );
    console.log("Global commands registered.");
  } catch (e) {
    console.log("Error registering global commands:", e.message);
  }

  for (const gid of INSTANT_GUILD_IDS) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(appId, gid),
        { body: commands }
      );
      console.log("Guild registered:", gid);
    } catch (e) {
      console.log("Guild command error", gid, e.message);
    }
  }
}

// ----------------- READY -----------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();

  // Clean old panels and repost
  client.guilds.cache.forEach(async guild => {
    try {
      const teamChan = findTeamChannel(guild);
      if (!teamChan) return;

      // DELETE OLD PANELS
      const messages = await teamChan.messages.fetch({ limit: 50 });
      const oldPanels = messages.filter(
        m => m.author.id === client.user.id &&
        m.embeds[0] &&
        m.embeds[0].title &&
        m.embeds[0].title.includes("TEAM REGISTRATION PANEL")
      );

      for (const m of oldPanels.values()) {
        await m.delete().catch(()=>{});
      }

      // SEND NEW PANEL
      const embed = new EmbedBuilder()
        .setTitle("🟨 TEAM REGISTRATION PANEL")
        .setColor(0xFFD700)
        .setDescription("Choose an option below.");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("register_team")
          .setLabel("➕ Register Your Team")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("need_team")
          .setLabel("🔍 Look For a Team")
          .setStyle(ButtonStyle.Primary)
      );

      await teamChan.send({ embeds: [embed], components: [row] });

      await ensureLogChannel(guild);
    } catch (e) {
      console.log("Guild init error:", e.message);
    }
  });
});

// ----------------- TEAM BUTTON LOGIC -----------------
client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "register_team") {
        const modal = new ModalBuilder()
          .setCustomId("team_modal")
          .setTitle("Register Your Team");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("team_name")
              .setLabel("Team Name")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("m1")
              .setLabel("Member 1")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("m2")
              .setLabel("Member 2 (optional)")
              .setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("m3")
              .setLabel("Member 3 (optional)")
              .setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("m45")
              .setLabel("Members 4 & 5 (comma separated)")
              .setStyle(TextInputStyle.Short)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === "need_team") {
        const modal = new ModalBuilder()
          .setCustomId("lf_modal")
          .setTitle("Looking For a Team");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("about")
              .setLabel("Tell about yourself")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("hours")
              .setLabel("Online Time")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("timezone")
              .setLabel("Timezone (IST etc.)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }
    }
  } catch (e) {
    console.log("Button error:", e.message);
  }
});
// ----------------- TEAM MODAL HANDLING -----------------
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isModalSubmit()) return;

    // TEAM REGISTER MODAL
    if (interaction.customId === "team_modal") {
      const guild = interaction.guild;
      const teamChan = findTeamChannel(guild);
      if (!teamChan)
        return interaction.reply({
          content: "⚠️ No teams channel found.",
          ephemeral: true,
        });

      const name = interaction.fields.getTextInputValue("team_name");
      const m1 = interaction.fields.getTextInputValue("m1");
      const m2 = interaction.fields.getTextInputValue("m2") || "—";
      const m3 = interaction.fields.getTextInputValue("m3") || "—";

      const raw45 = interaction.fields.getTextInputValue("m45") || "";
      let m4 = "—",
        m5 = "—";
      if (raw45.includes(",")) {
        const parts = raw45.split(",").map((s) => s.trim());
        m4 = parts[0] || "—";
        m5 = parts[1] || "—";
      } else if (raw45.trim()) m4 = raw45.trim();

      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${big(name)}`)
        .setColor(0x00ff66)
        .setDescription(
          `**Member 1:** ${m1}\n` +
            `**Member 2:** ${m2}\n` +
            `**Member 3:** ${m3}\n` +
            `**Member 4:** ${m4}\n` +
            `**Member 5:** ${m5}`
        )
        .setFooter({ text: `Created by ${interaction.user.username}` })
        .setTimestamp();

      await teamChan.send({ embeds: [embed] });

      return interaction.reply({
        content: "✅ Team Registered Successfully!",
        ephemeral: true,
      });
    }

    // LOOKING FOR TEAM MODAL
    if (interaction.customId === "lf_modal") {
      const guild = interaction.guild;
      const teamChan = findTeamChannel(guild);
      if (!teamChan)
        return interaction.reply({
          content: "⚠️ No teams channel found.",
          ephemeral: true,
        });

      const about = interaction.fields.getTextInputValue("about");
      const hours = interaction.fields.getTextInputValue("hours");
      const timezone = interaction.fields.getTextInputValue("timezone");

      const embed = new EmbedBuilder()
        .setTitle("🔍 LOOKING FOR A TEAM")
        .setColor(0x3498db)
        .setDescription(
          `${interaction.user} wants a team!\n\n` +
            `**About:** ${about}\n` +
            `**Playtime:** ${hours}\n` +
            `**Timezone:** ${timezone}`
        )
        .setTimestamp();

      await teamChan.send({ embeds: [embed] });

      return interaction.reply({
        content: "📣 Your request has been posted!",
        ephemeral: true,
      });
    }
  } catch (e) {
    console.log("Modal error:", e.message);
  }
});

// ----------------- SLASH COMMAND HANDLER -----------------
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isCommand()) return;

    const cmd = interaction.commandName;
    const hasPerm = (perm) => {
      try {
        return interaction.member.permissions.has(perm);
      } catch {
        return false;
      }
    };

    // ----------------- /PING -----------------
    if (cmd === "ping") {
      const before = Date.now();
      await interaction.reply({ content: "Pinging…", ephemeral: true });
      const latency = Date.now() - before;
      return interaction.editReply(
        `🏓 Pong — ${latency}ms (WS: ${Math.round(client.ws.ping)}ms)`
      );
    }

    // ----------------- /SAY -----------------
    if (cmd === "say") {
      if (!hasPerm(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const message = interaction.options.getString("message");
      await interaction.channel.send(message);
      return interaction.reply({ content: "Sent!", ephemeral: true });
    }

    // ----------------- /ANNOUNCE -----------------
    if (cmd === "announce") {
      if (!hasPerm(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const msg = interaction.options.getString("message");
      const ping = interaction.options.getBoolean("ping") || false;

      const embed = new EmbedBuilder()
        .setTitle("📣 Announcement")
        .setDescription(msg)
        .setColor(0xffaa00)
        .setTimestamp();

      if (ping)
        await interaction.channel.send({ content: "@everyone", embeds: [embed] });
      else await interaction.channel.send({ embeds: [embed] });

      return interaction.reply({ content: "Announcement posted!", ephemeral: true });
    }

    // ----------------- /PANEL -----------------
    if (cmd === "panel") {
      if (!hasPerm(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const teamChan = findTeamChannel(interaction.guild);
      if (!teamChan)
        return interaction.reply({
          content: "⚠️ No teams channel.",
          ephemeral: true,
        });

      const embed = new EmbedBuilder()
        .setTitle("🟨 TEAM REGISTRATION PANEL")
        .setColor(0xffd700)
        .setDescription("Choose an option below.");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("register_team")
          .setLabel("➕ Register Your Team")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("need_team")
          .setLabel("🔍 Need Team")
          .setStyle(ButtonStyle.Primary)
      );

      await teamChan.send({ embeds: [embed], components: [row] });

      return interaction.reply({ content: "Panel posted!", ephemeral: true });
    }

    // ----------------- /SAVE-LOG -----------------
    if (cmd === "save-log") {
      if (!hasPerm(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const ch =
        getLogChannelCached(interaction.guild) ||
        (await ensureLogChannel(interaction.guild));

      return interaction.reply({
        content: `Log Channel ID: **${ch?.id || "None"}**\n\n` +
          `Add ENV: **MOD_LOG_${interaction.guild.id} = ${ch?.id}**`,
        ephemeral: true,
      });
    }

    // ----------------- /ONI -----------------
    if (cmd === "oni") {
      const info =
        `# **ONI STUDIOS | COMMUNITY**\n` +
        `controls oni zodiac and hunter smps.\n\n` +
        `Join: https://discord.gg/gr534aDsCg`;

      await interaction.user.send(info).catch(() => {});
      return interaction.reply({ content: "Check your DMs!", ephemeral: true });
    }

    // =====================================================================
    // 🔥🔥 MODERATION COMMANDS — BAN / TEMPBAN / KICK / MUTE / UNMUTE / PURGE
    // =====================================================================

    // ----------------- /PURGE -----------------
    if (cmd === "purge") {
      if (!hasPerm(PermissionFlagsBits.ManageMessages))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const amount = interaction.options.getInteger("amount");
      if (amount < 2 || amount > 100)
        return interaction.reply({
          content: "Enter 2–100 messages.",
          ephemeral: true,
        });

      const deleted = await interaction.channel
        .bulkDelete(amount, true)
        .catch(() => null);

      if (!deleted)
        return interaction.reply({
          content: "Failed to delete (messages too old?).",
          ephemeral: true,
        });

      return interaction.reply({
        content: `Deleted ${deleted.size} messages.`,
        ephemeral: true,
      });
    }

    // ----------------- /BAN -----------------
    if (cmd === "ban") {
      const sub = interaction.options.getSubcommand();

      if (!hasPerm(PermissionFlagsBits.BanMembers))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      if (sub === "add") {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason";

        await user
          .send({ embeds: [makeActionDMEmbed(interaction.guild, "ban", reason)] })
          .catch(() => {});

        await interaction.guild.members.ban(user.id, { reason }).catch((err) => {
          return interaction.reply({
            content: `Failed: ${err.message}`,
            ephemeral: true,
          });
        });

        await sendLog(
          interaction.guild,
          makeLogEmbed("User Banned", interaction.user, user.tag, user.id, reason)
        );

        return interaction.reply({
          content: `🔨 Banned **${user.tag}**`,
          ephemeral: true,
        });
      }

      if (sub === "remove") {
        const id = interaction.options.getString("userid").replace(/\D/g, "");
        const reason = interaction.options.getString("reason") || "Unbanned";

        await interaction.guild.bans.remove(id, reason).catch((err) => {
          return interaction.reply({
            content: `Failed: ${err.message}`,
            ephemeral: true,
          });
        });

        await sendLog(
          interaction.guild,
          makeLogEmbed("User Unbanned", interaction.user, id, id, reason)
        );

        return interaction.reply({
          content: `Unbanned **${id}**`,
          ephemeral: true,
        });
      }
    }

    // ----------------- /TEMPBAN -----------------
    if (cmd === "tempban") {
      if (!hasPerm(PermissionFlagsBits.BanMembers))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const user = interaction.options.getUser("user");
      const duration = interaction.options.getString("duration");
      const ms = parseDurationToMs(duration);
      const reason = interaction.options.getString("reason") || "No reason";

      if (!ms)
        return interaction.reply({
          content: "Invalid time format.",
          ephemeral: true,
        });

      await user
        .send({
          embeds: [
            makeActionDMEmbed(interaction.guild, "tempban", reason, duration),
          ],
        })
        .catch(() => {});

      await interaction.guild.members.ban(user.id, { reason });

      const key = `tempban:${interaction.guild.id}:${user.id}`;
      if (tempTimers.has(key)) clearTimeout(tempTimers.get(key));

      tempTimers.set(
        key,
        setTimeout(async () => {
          await interaction.guild.bans.remove(user.id).catch(() => {});
          sendLog(
            interaction.guild,
            makeLogEmbed(
              "Tempban expired",
              client.user,
              user.tag,
              user.id,
              "Expired"
            )
          );
        }, ms)
      );

      await sendLog(
        interaction.guild,
        makeLogEmbed(
          "User Tempbanned",
          interaction.user,
          user.tag,
          user.id,
          reason,
          `Duration: ${duration}`
        )
      );

      return interaction.reply({
        content: `⏳ Tempbanned **${user.tag}** for **${duration}**`,
        ephemeral: true,
      });
    }

    // ----------------- /KICK -----------------
    if (cmd === "kick") {
      if (!hasPerm(PermissionFlagsBits.KickMembers))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "No reason";
      const member = interaction.guild.members.cache.get(user.id);

      if (!member)
        return interaction.reply({
          content: "User not in guild",
          ephemeral: true,
        });

      await user
        .send({
          embeds: [makeActionDMEmbed(interaction.guild, "kick", reason)],
        })
        .catch(() => {});

      await member.kick(reason);

      await sendLog(
        interaction.guild,
        makeLogEmbed("User Kicked", interaction.user, user.tag, user.id, reason)
      );

      return interaction.reply({
        content: `👢 Kicked **${user.tag}**`,
        ephemeral: true,
      });
    }

    // ----------------- /MUTE -----------------
    if (cmd === "mute") {
      if (!hasPerm(PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const user = interaction.options.getUser("user");
      const duration = interaction.options.getString("duration");
      const ms = duration ? parseDurationToMs(duration) : null;
      const reason = interaction.options.getString("reason") || "No reason";
      const member = interaction.guild.members.cache.get(user.id);

      if (!member)
        return interaction.reply({
          content: "User not found",
          ephemeral: true,
        });

      await user
        .send({
          embeds: [
            makeActionDMEmbed(
              interaction.guild,
              "timeout",
              reason,
              duration || "Permanent"
            ),
          ],
        })
        .catch(() => {});

      await member.timeout(ms || 0, reason);

      if (ms) {
        const key = `timeout:${interaction.guild.id}:${user.id}`;
        if (tempTimers.has(key)) clearTimeout(tempTimers.get(key));

        tempTimers.set(
          key,
          setTimeout(async () => {
            const m = interaction.guild.members.cache.get(user.id);
            if (m) await m.timeout(null).catch(() => {});
            sendLog(
              interaction.guild,
              makeLogEmbed(
                "Timeout expired",
                client.user,
                user.tag,
                user.id,
                "Expired"
              )
            );
          }, ms)
        );
      }

      await sendLog(
        interaction.guild,
        makeLogEmbed(
          "User Muted",
          interaction.user,
          user.tag,
          user.id,
          reason,
          duration ? `Duration: ${duration}` : "Permanent"
        )
      );

      return interaction.reply({
        content: `🔇 Muted **${user.tag}**`,
        ephemeral: true,
      });
    }

    // ----------------- /UNMUTE -----------------
    if (cmd === "unmute") {
      if (!hasPerm(PermissionFlagsBits.ModerateMembers))
        return interaction.reply({ content: "No perms.", ephemeral: true });

      const user = interaction.options.getUser("user");
      const member = interaction.guild.members.cache.get(user.id);

      if (!member)
        return interaction.reply({
          content: "User not found",
          ephemeral: true,
        });

      await member.timeout(null);

      return interaction.reply({
        content: `🔊 Unmuted **${user.tag}**`,
        ephemeral: true,
      });
    }

    // ----------------- /ASK (AI) -----------------
    if (cmd === "ask") {
      const q = interaction.options.getString("question");
      await interaction.deferReply();
      const ans = await askGenZ(q);
      return interaction.editReply(ans);
    }
  } catch (err) {
    console.error("Slash command error:", err);
  }
});
// ===================================================================
// 🧠 AI CLIENT — Universal OpenAI-Compatible (OpenAI / OpenRouter / DeepSeek etc.)
// ===================================================================

let aiClient = null;

try {
  const { OpenAI } = require("openai");

  // Accept ANY sk-... key. Priority:
  // 1) OPENROUTER_KEY
  // 2) DEEPSEEK_KEY
  // 3) OPENAI_KEY
  const apiKey =
    process.env.OPENROUTER_KEY ||
    process.env.DEEPSEEK_KEY ||
    process.env.OPENAI_KEY ||
    null;

  if (!apiKey) {
    console.log("❌ No AI key found (OPENROUTER_KEY / DEEPSEEK_KEY / OPENAI_KEY)");
  } else {
    // Allow custom baseURL for OpenRouter or any proxy
    const baseURL = process.env.AI_BASE_URL?.trim();

    aiClient = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {})
    });

    console.log(`AI Loaded ✓ (base: ${baseURL || "default"})`);
  }
} catch (err) {
  console.log("❌ Failed loading OpenAI library — AI disabled.");
  aiClient = null;
}

// ===================================================================
// 🟥 ONI SMP LORE (same as before)
// ===================================================================
const ONI_LORE = `
**What is Oni SMP?**
Every soul in the world of Oni is born with a secret connection to an old mask. These masks are artifacts from the first conflicts between fire, water, earth, light, and nature. Each one awakens special powers when the bearer submits to its will; they are worn on the spirit rather than the face.
The mask selects the warrior when they enter the Oni lands for the first time. No two souls are given the same path; one may be in charge of storms and rivers, another may rise with the unforgiving stone, and a third may burn with wild fire. The mask shapes fate rather than just giving strength. Every power has a consequence, and every ability has weight.
Passive ornaments are not what the masks are. They throb with vitality, urging action. To use them is to accept their essence: light penetrates the darkness, water bends gracefully, fire rages with ferocity, and earth protects with tenacity. Over time, the bearer gains mastery over both their inner spirit and their gifts.
However, rumors of rarer masks circulate. Two masks of unimaginable power, hidden away until their time comes, were not created by nature but rather by forbidden design. They are not freely provided. Trials, occurrences that tremble the land and summon champions are necessary to awaken them. These hidden masks test the very soul, while the common ones test courage.
`;

// ===================================================================
// 🤖 GenZ AI Chat Function (Universal)
// ===================================================================
async function askGenZ(question) {
  if (!aiClient)
    return "AI offline rn 💀 (owner forgot the API key).";

  try {
    const res = await aiClient.chat.completions.create({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are OniBot — a chaotic GenZ Discord bot.
Rules:
- Short replies
- Light roast allowed
- No cringe
-Use emojis but not too many.
- NEVER say you're an AI
- If user mentions "oni smp", DO NOT explain
`
        },
        { role: "user", content: question }
      ],
      max_tokens: 200,
      temperature: 0.8
    });

    return res?.choices?.[0]?.message?.content?.trim()
      || "Bro my wires crossed 💀";
  } catch (err) {
    const msg = err?.message?.toLowerCase() || "";

    if (msg.includes("insufficient") || err.status === 402)
      return "AI offline 💀 (balance finished).";

    if (msg.includes("rate"))
      return "Slow down bro 💀 you're spamming.";

    if (msg.includes("auth") || msg.includes("invalid"))
      return "API key invalid 💀 (owner messed up).";

    console.log("AI ERROR:", err);
    return "My brain lagged 💀 try again.";
  }
}

// ===================================================================
// 📩 MESSAGE HANDLER — reply + ping + ignore @everyone (same as before)
// ===================================================================
client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;

    const botId = client.user.id;
    const content = msg.content.toLowerCase();

    // 🚫 IGNORE @everyone / @here
    if (msg.mentions.everyone || msg.content.includes("@here")) return;

    // 1️⃣ REPLY TO BOT MESSAGE
    if (msg.reference?.messageId) {
      const ref = await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null);

      if (ref && ref.author.id === botId) {
        if (content.includes("oni smp")) return msg.reply(ONI_LORE);

        msg.channel.sendTyping();
        return msg.reply(await askGenZ(msg.content));
      }
    }

    // 2️⃣ DIRECT PING
    if (msg.mentions.has(botId, { ignoreEveryone: true, ignoreRoles: true })) {
      const cleaned = msg.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();

      if (cleaned.includes("oni smp")) return msg.reply(ONI_LORE);

      msg.channel.sendTyping();
      return msg.reply(await askGenZ(cleaned || "say something"));
    }

    // 3️⃣ KEYWORDS
    if (
      content.includes("what is oni smp") ||
      content.includes("oni smp lore") ||
      content.includes("oni smp info")
    ) {
      return msg.reply(ONI_LORE);
    }
  } catch (err) {
    console.log("Message handler error:", err.message);
  }
});



// ===================================================================
// 🔐 LOGIN
// ===================================================================
if (!process.env.TOKEN) {
  console.log("❌ ERROR: TOKEN not set in environment variables.");
  process.exit(1);
}

client
  .login(process.env.TOKEN)
  .then(() => console.log("OniBot started successfully!"))
  .catch((err) => {
    console.error("Login failed:", err.message);
    process.exit(1);
  });




