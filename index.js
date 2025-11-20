// ======================================================
// FINAL index.js — OniBot Ultra Edition
// Teams + Moderation + AI Chat + /ask + Ping + Reply
// Node 18+, discord.js v14
// ======================================================

// FINAL index.js — All-in-one system

const fs = require('fs');
const path = require('path');

// 🔍 DEBUG: Check if OPENAI_KEY is loaded
console.log("DEBUG OPENAI_KEY:", process.env.OPENAI_KEY ? "Loaded ✅" : "❌ MISSING");

// (rest of your code…)

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

// IMPORTANT: ADD MESSAGE CONTENT INTENT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------------- CONFIG ----------------
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

// data.json fallback
const DATA_PATH = path.join(__dirname, 'data.json');
let DATA = {};
try {
  if (fs.existsSync(DATA_PATH))
    DATA = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}');
} catch (e) { DATA = {}; }
function saveData() {
  try { fs.writeFileSync(DATA_PATH, JSON.stringify(DATA, null, 2)); } catch (e) {}
}

const tempTimers = new Map();

// ---------------- HELPERS ----------------
function big(text) { return `**__${String(text).toUpperCase()}__**`; }

function findTeamChannel(guild) {
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
  const s = input.toLowerCase().trim();

  if (/^\d+$/.test(s)) return parseInt(s) * 60_000;

  const m = s.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;

  const n = parseInt(m[1]);
  const u = m[2];
  return u === "s" ? n * 1000 :
    u === "m" ? n * 60_000 :
    u === "h" ? n * 60_000 * 60 :
    u === "d" ? n * 60_000 * 60 * 24 : null;
}

function makeActionDMEmbed(guild, action, reason, durationStr = null) {
  const title = {
    ban: "You have been banned",
    tempban: "You have been temp-banned",
    kick: "You have been kicked",
    timeout: "You have been timed out"
  }[action];

  const roast = [
    "Maybe the real griefing was the mistakes you made.",
    "You tried. The server didn't agree 💀",
    "Go practice in singleplayer and come back when you can behave."
  ][Math.floor(Math.random() * 3)];

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      `**Server:** ${guild.name}\n${
        durationStr ? `**Duration:** ${durationStr}\n` : ""
      }**Reason:** ${reason}\n\n_${roast}_`
    )
    .setColor(0xff4444)
    .setTimestamp();
}

function makeLogEmbed(action, moderator, targetTag, targetId, reason, extra = '') {
  const e = new EmbedBuilder()
    .setTitle(action)
    .addFields(
      { name: "Moderator", value: `${moderator.tag} (${moderator.id})`, inline: true },
      { name: "Target", value: `${targetTag}\n(${targetId})`, inline: true }
    )
    .setDescription(reason)
    .setColor(0xff5555)
    .setTimestamp();
  if (extra) e.addFields({ name: "Extra", value: extra });
  return e;
}

// LOG CHANNEL SYSTEM ------------------------------------

async function ensureLogChannel(guild) {
  const envKey = `MOD_LOG_${guild.id}`;
  if (process.env[envKey]) {
    const ch = guild.channels.cache.get(process.env[envKey]);
    if (ch) return ch;
  }
  const marker = `__MOD_LOG__:${guild.id}`;
  const byTopic = guild.channels.cache.find(c => c.topic?.includes(marker));
  if (byTopic) return byTopic;

  const byName = guild.channels.cache.find(c => c.name === "🔒┃moderation-logs");
  if (byName) {
    if (!byName.topic?.includes(marker))
      await byName.setTopic((byName.topic || "") + " " + marker).catch(() => {});
    return byName;
  }

  try {
    const created = await guild.channels.create({
      name: "🔒┃moderation-logs",
      type: 0,
      reason: "Auto-created moderation log channel"
    });

    await created.setTopic(marker).catch(() => {});
    DATA.logChannels = DATA.logChannels || {};
    DATA.logChannels[guild.id] = created.id;
    saveData();
    return created;

  } catch (e) {
    console.log("Failed to create modlog:", e);
    return null;
  }
}

function getLogChannelCached(guild) {
  const envKey = `MOD_LOG_${guild.id}`;
  if (process.env[envKey]) {
    const ch = guild.channels.cache.get(process.env[envKey]);
    if (ch) return ch;
  }
  const marker = `__MOD_LOG__:${guild.id}`;
  const byTopic = guild.channels.cache.find(c => c.topic?.includes(marker));
  if (byTopic) return byTopic;

  if (DATA.logChannels?.[guild.id]) {
    const ch = guild.channels.cache.get(DATA.logChannels[guild.id]);
    if (ch) return ch;
  }

  return guild.channels.cache.find(c => c.name === "🔒┃moderation-logs") || null;
}

async function sendLog(guild, embed) {
  const ch = getLogChannelCached(guild) || await ensureLogChannel(guild);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

// ---------------- SLASH COMMANDS ----------------

const commands = [
  // Moderation
  {
    name: "ban",
    description: "Ban system",
    options: [
      {
        name: "add",
        type: 1,
        description: "Ban a user",
        options: [
          { name: "user", type: 6, required: true, description: "User" },
          { name: "reason", type: 3, required: false, description: "Reason" }
        ]
      },
      {
        name: "remove",
        type: 1,
        description: "Unban a user",
        options: [
          { name: "userid", type: 3, required: true, description: "User ID" },
          { name: "reason", type: 3, required: false, description: "Reason" }
        ]
      }
    ],
    default_member_permissions: String(PermissionFlagsBits.BanMembers)
  },

  {
    name: "tempban",
    description: "Ban temporarily",
    options: [
      { name: "user", type: 6, required: true, description: "User" },
      { name: "duration", type: 3, required: true, description: "30m, 2h, 1d" },
      { name: "reason", type: 3, required: false, description: "Reason" }
    ],
    default_member_permissions: String(PermissionFlagsBits.BanMembers)
  },

  {
    name: "kick",
    description: "Kick a user",
    options: [
      { name: "user", type: 6, required: true, description: "User" },
      { name: "reason", type: 3, required: false, description: "Reason" }
    ],
    default_member_permissions: String(PermissionFlagsBits.KickMembers)
  },

  {
    name: "mute",
    description: "Timeout a user",
    options: [
      { name: "user", type: 6, required: true, description: "User" },
      { name: "duration", type: 3, required: false, description: "10m / 2h / 1d" },
      { name: "reason", type: 3, required: false, description: "Reason" }
    ],
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers)
  },

  {
    name: "unmute",
    description: "Remove timeout",
    options: [
      { name: "user", type: 6, required: true, description: "User" }
    ],
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers)
  },

  {
    name: "purge",
    description: "Bulk delete messages",
    options: [
      { name: "amount", type: 4, required: true, description: "2–100 messages" }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageMessages)
  },

  // SAY
  {
    name: "say",
    description: "Make bot talk",
    options: [
      { name: "message", type: 3, required: true, description: "Message" }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },

  // ANNOUNCE
  {
    name: "announce",
    description: "Send announcement",
    options: [
      { name: "message", type: 3, required: true, description: "Message" },
      { name: "ping", type: 5, required: false, description: "Ping everyone?" }
    ],
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },

  { name: "ping", description: "Check bot latency" },

  // Oni
  {
    name: "oni",
    description: "Get Oni Studios info",
    options: [{ name: "info", type: 1, description: "Send info in DM" }]
  },

  {
    name: "panel",
    description: "Post team panel",
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },

  {
    name: "save-log",
    description: "Get moderation log details",
    default_member_permissions: String(PermissionFlagsBits.ManageGuild)
  },

  // NEW: /ask
  {
    name: "ask",
    description: "Talk to OniBOT AI",
    options: [
      { name: "question", type: 3, required: true, description: "Ask anything" }
    ]
  }
];

// REGISTER COMMANDS -----------------------

async function registerCommands() {
  if (!process.env.TOKEN) {
    console.log("TOKEN missing");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  const appId = (await client.application.fetch()).id;

  await rest.put(Routes.applicationCommands(appId), { body: commands });
  console.log("Commands registered.");

  for (const gid of INSTANT_GUILD_IDS) {
    await rest.put(Routes.applicationGuildCommands(appId, gid), { body: commands });
    console.log("Instant guild registered:", gid);
  }
}

// READY ----------------------------------

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  registerCommands();

  // Post team panels
  client.guilds.cache.forEach(async guild => {
    const teamChan = findTeamChannel(guild);
    if (teamChan) {
      try {
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
            .setLabel("🔍 Look For a Team")
            .setStyle(ButtonStyle.Primary)
        );

        await teamChan.send({ embeds: [embed], components: [row] }).catch(() => {});
      } catch (e) {}
    }

    ensureLogChannel(guild);
  });
});

// INTERACTIONS -------------------------------------------

client.on("interactionCreate", async (interaction) => {
  try {
    // ==========================
    // BUTTONS / TEAM FORMS
    // ==========================
    if (interaction.isButton()) {
      if (interaction.customId === "register_team") {
        const modal = new ModalBuilder()
          .setCustomId("team_modal")
          .setTitle("Register Your Team");

        const name = new TextInputBuilder()
          .setCustomId("team_name")
          .setLabel("Team Name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const m1 = new TextInputBuilder()
          .setCustomId("m1")
          .setLabel("Member 1")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const m2 = new TextInputBuilder()
          .setCustomId("m2")
          .setLabel("Member 2 (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const m3 = new TextInputBuilder()
          .setCustomId("m3")
          .setLabel("Member 3 (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const m45 = new TextInputBuilder()
          .setCustomId("m45")
          .setLabel("Members 4 & 5 (comma separated)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(name),
          new ActionRowBuilder().addComponents(m1),
          new ActionRowBuilder().addComponents(m2),
          new ActionRowBuilder().addComponents(m3),
          new ActionRowBuilder().addComponents(m45)
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === "need_team") {
        const modal = new ModalBuilder()
          .setCustomId("lf_modal")
          .setTitle("Looking For a Team");

        const about = new TextInputBuilder()
          .setCustomId("about")
          .setLabel("Tell about yourself")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const hours = new TextInputBuilder()
          .setCustomId("hours")
          .setLabel("Online Time")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const timezone = new TextInputBuilder()
          .setCustomId("timezone")
          .setLabel("Timezone (IST etc.)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(about),
          new ActionRowBuilder().addComponents(hours),
          new ActionRowBuilder().addComponents(timezone)
        );

        return interaction.showModal(modal);
      }
    }

    // ==========================
    // MODAL SUBMISSIONS
    // ==========================
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "team_modal") {
        const guild = interaction.guild;
        const teamChan = findTeamChannel(guild);

        const name = interaction.fields.getTextInputValue("team_name");
        const m1 = interaction.fields.getTextInputValue("m1");
        const m2 = interaction.fields.getTextInputValue("m2") || "—";
        const m3 = interaction.fields.getTextInputValue("m3") || "—";

        const raw45 = interaction.fields.getTextInputValue("m45") || "";
        let m4 = "—", m5 = "—";
        if (raw45.includes(",")) {
          const parts = raw45.split(",").map(s => s.trim());
          m4 = parts[0] || "—";
          m5 = parts[1] || "—";
        } else if (raw45.trim()) {
          m4 = raw45.trim();
        }

        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${big(name)}`)
          .setColor(0x00ff66)
          .setDescription(
            `**Member 1:** ${m1}\n**Member 2:** ${m2}\n**Member 3:** ${m3}\n**Member 4:** ${m4}\n**Member 5:** ${m5}`
          )
          .setFooter({ text: `Created by ${interaction.user.username}` })
          .setTimestamp();

        await teamChan.send({ embeds: [embed] });
        return interaction.reply({ content: "Team registered!", ephemeral: true });
      }

      if (interaction.customId === "lf_modal") {
        const about = interaction.fields.getTextInputValue("about");
        const hours = interaction.fields.getTextInputValue("hours");
        const timezone = interaction.fields.getTextInputValue("timezone");

        const embed = new EmbedBuilder()
          .setTitle("🔍 LOOKING FOR TEAM")
          .setColor(0x3498db)
          .setDescription(`**User:** ${interaction.user}\n\n**About:** ${about}\n**Hours:** ${hours}\n**Timezone:** ${timezone}`)
          .setTimestamp();

        const teamChan = findTeamChannel(interaction.guild);
        await teamChan.send({ embeds: [embed] });

        return interaction.reply({ content: "Posted!", ephemeral: true });
      }
    }

    // ==========================
    // SLASH COMMAND HANDLING
    // ==========================

    if (interaction.isCommand()) {
      const cmd = interaction.commandName;

      const hasPerm = p => interaction.member?.permissions?.has(p);

      // ---- /ping
      if (cmd === "ping") {
        const before = Date.now();
        await interaction.reply({ content: "Pinging…", ephemeral: true });
        return interaction.editReply(`Pong! ${Date.now() - before}ms`);
      }

      // ---- /ask
      if (cmd === "ask") {
        const q = interaction.options.getString("question");
        await interaction.deferReply({ ephemeral: false });
        const ans = await askGenZ(q);
        return interaction.editReply(ans);
      }

      // ---- /say
      if (cmd === "say") {
        if (!hasPerm(PermissionFlagsBits.ManageGuild))
          return interaction.reply({ content: "No perms.", ephemeral: true });

        const msg = interaction.options.getString("message");
        await interaction.channel.send(msg);
        return interaction.reply({ content: "Sent!", ephemeral: true });
      }

      // ---- /announce
      if (cmd === "announce") {
        if (!hasPerm(PermissionFlagsBits.ManageGuild))
          return interaction.reply({ content: "No perms.", ephemeral: true });

        const message = interaction.options.getString("message");
        const ping = interaction.options.getBoolean("ping") || false;

        const embed = new EmbedBuilder()
          .setTitle("📣 Announcement")
          .setDescription(message)
          .setColor(0xffaa00)
          .setTimestamp();

        if (ping)
          await interaction.channel.send({ content: "@everyone", embeds: [embed] });
        else
          await interaction.channel.send({ embeds: [embed] });

        return interaction.reply({ content: "Announcement sent!", ephemeral: true });
      }

      // ---- /panel
      if (cmd === "panel") {
        if (!hasPerm(PermissionFlagsBits.ManageGuild))
          return interaction.reply({ content: "No perms.", ephemeral: true });

        const teamChan = findTeamChannel(interaction.guild);
        const embed = new EmbedBuilder()
          .setTitle("🟨 TEAM REGISTRATION PANEL")
          .setColor(0xffd700)
          .setDescription("Choose an option.");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("register_team").setStyle(ButtonStyle.Success).setLabel("➕ Register Team"),
          new ButtonBuilder().setCustomId("need_team").setStyle(ButtonStyle.Primary).setLabel("🔍 Need Team")
        );

        await teamChan.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: "Panel posted!", ephemeral: true });
      }

      // ---- /save-log
      if (cmd === "save-log") {
        const ch = getLogChannelCached(interaction.guild);
        return interaction.reply({
          content: `Log Channel: ${ch?.id || "NONE"}
Add ENV: MOD_LOG_${interaction.guild.id} = ${ch?.id}`,
          ephemeral: true
        });
      }

      // ---- /oni info
      if (cmd === "oni") {
        const text = `# **ONI STUDIOS | COMMUNITY**
A place for devs, artists, coders & creators. Join now:
https://discord.gg/gr534aDsCg`;

        await interaction.user.send(text).catch(() => {});
        return interaction.reply({ content: "Check your DMs!", ephemeral: true });
      }

      // ==========================
      // 🔥 MODERATION COMMANDS
      // ==========================

      // /ban -------------------------------------------------
      if (cmd === "ban") {
        const sub = interaction.options.getSubcommand();

        if (!hasPerm(PermissionFlagsBits.BanMembers))
          return interaction.reply({ content: "No perms.", ephemeral: true });

        if (sub === "add") {
          const user = interaction.options.getUser("user");
          const reason = interaction.options.getString("reason") || "No reason";

          await user.send({ embeds: [makeActionDMEmbed(interaction.guild, "ban", reason)] }).catch(() => {});
          await interaction.guild.members.ban(user.id, { reason }).catch(err => {
            return interaction.reply({ content: `Failed: ${err.message}`, ephemeral: true });
          });

          await sendLog(interaction.guild, makeLogEmbed("User Banned", interaction.user, user.tag, user.id, reason));

          return interaction.reply({ content: `Banned ${user.tag}`, ephemeral: true });
        }

        if (sub === "remove") {
          const id = interaction.options.getString("userid").replace(/\D/g, "");
          const reason = interaction.options.getString("reason") || "Unban";

          await interaction.guild.bans.remove(id, reason).catch(err => {
            return interaction.reply({ content: `Failed: ${err.message}`, ephemeral: true });
          });

          await sendLog(interaction.guild, makeLogEmbed("User Unbanned", interaction.user, id, id, reason));

          return interaction.reply({ content: `Unbanned ${id}`, ephemeral: true });
        }
      }

      // /tempban -------------------------------------------------
      if (cmd === "tempban") {
        if (!hasPerm(PermissionFlagsBits.BanMembers))
          return interaction.reply({ content: "No perms.", ephemeral: true });

        const user = interaction.options.getUser("user");
        const duration = interaction.options.getString("duration");
        const reason = interaction.options.getString("reason") || "No reason";
        const ms = parseDurationToMs(duration);

        if (!ms)
          return interaction.reply({ content: "Invalid duration", ephemeral: true });

        await user.send({ embeds: [makeActionDMEmbed(interaction.guild, "tempban", reason, duration)] }).catch(() => {});
        await interaction.guild.members.ban(user.id, { reason });

        const key = `tempban:${interaction.guild.id}:${user.id}`;
        if (tempTimers.has(key)) clearTimeout(tempTimers.get(key));

        tempTimers.set(
          key,
          setTimeout(async () => {
            interaction.guild.bans.remove(user.id).catch(() => {});
            sendLog(interaction.guild, makeLogEmbed("Tempban expired", client.user, user.tag, user.id, "Expired"));
          }, ms)
        );

        await sendLog(interaction.guild, makeLogEmbed("User Tempbanned", interaction.user, user.tag, user.id, reason, `Duration: ${duration}`));

        return interaction.reply({ content: `Tempbanned ${user.tag}`, ephemeral: true });
      }

      // /kick -------------------------------------------------
      if (cmd === "kick") {
        if (!hasPerm(PermissionFlagsBits.KickMembers))
          return interaction.reply({ content: "No perms.", ephemeral: true });

        const user = interaction.options.getUser("user");
        const member = interaction.guild.members.cache.get(user.id);
        const reason = interaction.options.getString("reason") || "No reason";

        if (!member)
          return interaction.reply({ content: "User not in guild", ephemeral: true });

        await user.send({ embeds: [makeActionDMEmbed(interaction.guild, "kick", reason)] }).catch(() => {});
        await member.kick(reason);

        await sendLog(interaction.guild, makeLogEmbed("User Kicked", interaction.user, user.tag, user.id, reason));
        return interaction.reply({ content: `Kicked ${user.tag}`, ephemeral: true });
      }

      // /mute -------------------------------------------------
      if (cmd === "mute") {
        if (!hasPerm(PermissionFlagsBits.ModerateMembers))
          return interaction.reply({ content: "No perms.", ephemeral: true });

        const user = interaction.options.getUser("user");
        const member = interaction.guild.members.cache.get(user.id);
        const duration = interaction.options.getString("duration");
        const reason = interaction.options.getString("reason") || "No reason";

        if (!member)
          return interaction.reply({ content: "User not in guild", ephemeral: true });

        let ms = duration ? parseDurationToMs(duration) : null;
        if (duration && !ms)
          return interaction.reply({ content: "Invalid duration", ephemeral: true });

        await user.send({ embeds: [makeActionDMEmbed(interaction.guild, "timeout", reason, duration || "Permanent")] }).catch(() => {});
        await member.timeout(ms || 0, reason);

        if (ms) {
          const key = `timeout:${interaction.guild.id}:${user.id}`;
          if (tempTimers.has(key)) clearTimeout(tempTimers.get(key));

          tempTimers.set(
            key,
            setTimeout(async () => {
              const m = interaction.guild.members.cache.get(user.id);
              if (m) await m.timeout(null).catch(() => {});
              sendLog(interaction.guild, makeLogEmbed("Timeout expired", client.user, user.tag, user.id, "Expired"));
            }, ms)
          );
        }

        await sendLog(interaction.guild, makeLogEmbed("User Muted", interaction.user, user.tag, user.id, reason));
        return interaction.reply({ content: `${user.tag} muted.`, ephemeral: true });
      }

      // /unmute -------------------------------------------------
      if (cmd === "unmute") {
        if (!hasPerm(PermissionFlagsBits.ModerateMembers))
          return interaction.reply({ content: "No perms.", ephemeral: true });

        const user = interaction.options.getUser("user");
        const member = interaction.guild.members.cache.get(user.id);

        if (!member)
          return interaction.reply({ content: "User not found", ephemeral: true });

        await member.timeout(null);
        return interaction.reply({ content: `${user.tag} is unmuted`, ephemeral: true });
      }
    }

  } catch (err) {
    console.log("Interaction error:", err);
  }
});

// =======================================================
// AI SYSTEM (PING + REPLY + KEYWORD + /ask)
// =======================================================

const { OpenAI } = require("openai");
const ai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

const ONI_LORE = `
**🟥 What is Oni SMP?**
Oni SMP is a world where every soul is spiritually linked to an ancient mask.
Masks grant elemental abilities — fire, water, thunder, earth, light, nature.
Two forbidden masks require world-shaking trials.
Oni SMP is survival + destiny + power colliding.
`;

// AI personality
async function askGenZ(question) {
  try {
    const res = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are OniBot — a chaotic GenZ Discord bot.
- Sarcastic but helpful
- Short replies
- Never admit you're an AI
- Slight roast if needed
- Emoji allowed but not cringe
If question includes "oni smp", DO NOT answer (handled elsewhere).
`
        },
        { role: "user", content: question }
      ],
      max_tokens: 150
    });

    return res.choices[0].message.content;
  } catch (e) {
    console.log("AI ERR:", e);
    return "My brain lagged 💀 ask again.";
  }
}

// ===============================================
// MESSAGE HANDLER (Ping + Reply + Keywords)
// ===============================================

client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  const botId = client.user.id;
  const text = msg.content.toLowerCase();

  // 1️⃣ Reply to bot continues conversation
  if (msg.reference) {
    try {
      const replied = await msg.channel.messages.fetch(msg.reference.messageId);
      if (replied.author.id === botId) {
        if (text.includes("oni smp")) return msg.reply(ONI_LORE);

        msg.channel.sendTyping();
        return msg.reply(await askGenZ(msg.content));
      }
    } catch {}
  }

  // 2️⃣ Ping bot
  if (msg.mentions.has(botId)) {
    const question = msg.content.replace(`<@${botId}>`, "").trim();
    if (question.includes("oni smp")) return msg.reply(ONI_LORE);

    msg.channel.sendTyping();
    return msg.reply(await askGenZ(question || "say something"));
  }

  // 3️⃣ Oni SMP keywords
  if (
    text.includes("what is oni smp") ||
    text.includes("oni smp lore") ||
    text.includes("oni smp info")
  ) return msg.reply(ONI_LORE);
});

// LOGIN ---------------------------------------------

if (!process.env.TOKEN) {
  console.log("ERROR: Token missing.");
  process.exit(1);
}

client.login(process.env.TOKEN);

