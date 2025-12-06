// ======================================================
//MADE BY UTAIB ff
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
console.log('DEBUG OPENROUTER_KEY:', process.env.OPENROUTER_KEY ? 'Loaded ✅' : '❌ MISSING');
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
// ===================================================================
// 📌 AUTO POST RULES ON RESTART (ONLY BOT MESSAGES REMOVED)
// ===================================================================

const RULE_CHANNEL_1 = "1368618794821357675"; // SMP rules
const RULE_CHANNEL_2 = "1425816135193989141"; // Discord rules

// Embed for SMP Rules (Channel 1)
function makeSmpRulesEmbed() {
  return new EmbedBuilder()
    .setTitle("📜 Oni SMP — Official Rules")
    .setColor(0xff2222)
    .setDescription(
`Please be sure to read ALL rules before you play. Ignorance is not an excuse.

**Rules For the Server**
- USE COMMON SENSE
- No Combat logging/Danger logging
- No using Explosive PVP (unless used in a trap)
- Max carts in a cart trap: 10
- Follow all current kit rules
- No debuff arrows in combat
- No unfair advantages
- No duping (string allowed)
- No lag machines
- No ban evasion
- Team cap: 5 + 1 ally
- Do not grief spawn / public builds / farms / pub base
- No riptide in combat
- No killing villagers
- No pie chart
- Minimap allowed (no entities / no cave mode)
- IOUs must be honored
- No crystal PvP
- No elytra in combat
- No respawn anchors
- No double-ability spam
- No health indicators
- No killing builders
- No naked killing
- No loopholing
- No re-gearing and returning to fight
- No water running unless outnumbered
- No F3+a
- No freecam
- No client commands
- No minimap entities
- No stream sniping
- VC groups must be open for content`
    );
}

const discordRules = [
  new EmbedBuilder()
    .setTitle("🌌✨ ZODIAC SMP — OFFICIAL RULEBOOK ✨🌌")
    .setColor(0x8A2BE2) // Purple celestial
    .setDescription(
`Welcome to **Zodiac SMP** — where the constellations guide the community.  
Read these carefully. By being here, you agree to follow them.

## 🌙 DISCORD RULES
**1️⃣ Be Cool & Kind**  
No harassment, slurs, threats, or toxicity.
**2️⃣ Use Common Sense**  
If you think you shouldn't send it… don’t.
**3️⃣ Keep It SFW (PG-13)**  
No NSFW, gore, sexual jokes, or shock images.
**4️⃣ No Spam**  
No chat flooding, mic spam, emoji spam, or unnecessary pings.
**5️⃣ No Advertising**  
No server ads or self-promo unless approved.
**6️⃣ Follow Channel Topics**  
Use correct channels. Keep chat clean and in **English**.
**7️⃣ Respect Staff**  
If you disagree, open a ticket — don’t argue publicly.
**8️⃣ No Hacking / Doxing / Illegal Activity**  
Instant punishment.
**9️⃣ No Punishment Evasion**  
No alt accounts to bypass bans or mutes.

## 🌑 SMP RULES

- USE COMMON SENSE  
- No Combat logging / Danger logging  
- No Explosive PvP (unless in a trap)  
- Max 10 carts in a cart trap  
- Follow all kit rules  
- No debuff arrows in combat  
- No unfair advantages  
- No duping (string allowed only)  
- No lag machines  
- No ban evasion  
- Team cap: **5 + 2 allies**  
- No griefing spawn / public builds / farms / pub base  
- No riptide in combat  
- Stealing & trapping bases = allowed  
- No killing villagers  
- No pie chart  
- Minimap allowed (no entities / no cave mode)  
- IOUs must be honored  
- No crystal PvP  
- No elytra in combat  
- No respawn anchors  
- No double ability stacking  
- No health indicators  
- No naked killing  
- No loopholing  
- No re-gearing & coming back  
- No stream sniping  
- **VC groups must be open for content**

---

✨ **Stay respectful. Play fair. Keep the celestial realm peaceful.** 🌌`
    )
];

// CLEAN BOT MESSAGES + POST RULES
async function autoPostRules(guilds) {
  for (const guild of guilds.values()) {
    // ------------ CHANNEL 1 (SMP Rules) ------------
    const ch1 = guild.channels.cache.get(RULE_CHANNEL_1);
    if (ch1) {
      try {
        const msgs = await ch1.messages.fetch({ limit: 50 });
        const botMsgs = msgs.filter(m => m.author.id === client.user.id);
        for (const m of botMsgs.values()) await m.delete().catch(()=>{});
        await ch1.send({ embeds: [makeSmpRulesEmbed()] });
      } catch (e) { console.log("Rule CH1 error:", e.message); }
    }

    // ------------ CHANNEL 2 (Discord Rules) ------------
    const ch2 = guild.channels.cache.get(RULE_CHANNEL_2);
    if (ch2) {
      try {
        const msgs = await ch2.messages.fetch({ limit: 50 });
        const botMsgs = msgs.filter(m => m.author.id === client.user.id);
        for (const m of botMsgs.values()) await m.delete().catch(()=>{});

        for (const emb of discordRules) {
          await ch2.send({ embeds: [emb] });
        }
      } catch (e) { console.log("Rule CH2 error:", e.message); }
    }
  }
}

// ----------------- READY -----------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
await autoPostRules(client.guilds.cache);

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
// ===================================================================
// 🎟️ TICKETS + APPLICATION SYSTEM (MADE FOR ONI/ZODIAC BY UTAIB FF)
// ===================================================================

// PANEL + ROUTING CONFIG
const TICKET_PANEL_CONFIG = {
  // SUPPORT-ONLY PANELS
  "1435290538793238618": {
    type: "support-only",
    transcriptChannelId: "1440923536809136209"
  },
  "1446176694800089088": {
    type: "support-only",
    transcriptChannelId: "1440923536838623302"
  },

  // MULTI-PANELS (PARTNERSHIP + STAFF APPLY + GENERAL SUPPORT)
  "1368336173990154381": {
    type: "multi",
    transcriptChannelId: "1440928986409603213",
    applicationChannelId: "1446792610248134676"
  },
  "1361886396528201859": {
    type: "multi",
    transcriptChannelId: "1440928986556403807",
    applicationChannelId: "1390454929369469118"
  }
};

const SUPPORT_CATEGORY_NAME = "Tickets";
const PARTNERSHIP_CATEGORY_NAME = "Partnerships";
const ARCHIVE_CATEGORY_NAME = "Archived Tickets";

const TICKET_INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// make sure DATA.tickets exists
DATA.tickets = DATA.tickets || {};

// ----------------- CATEGORY HELPERS -----------------
async function ensureTicketCategory(guild, name) {
  if (!guild) return null;

  let cat = guild.channels.cache.find(
    c => c.type === 4 && c.name === name
  );

  if (cat) return cat;

  try {
    cat = await guild.channels.create({
      name,
      type: 4, // GuildCategory
      reason: `Auto-created ticket category: ${name}`
    });
    return cat;
  } catch (e) {
    console.log(`Category create error (${name}, ${guild.id}):`, e.message);
    return null;
  }
}

async function ensureArchiveCategory(guild) {
  return ensureTicketCategory(guild, ARCHIVE_CATEGORY_NAME);
}

// ----------------- PANEL SENDER -----------------
async function postTicketPanelsForGuild(guild) {
  if (!guild?.available) return;

  for (const [panelChannelId, cfg] of Object.entries(TICKET_PANEL_CONFIG)) {
    const channel = guild.channels.cache.get(panelChannelId);
    if (!channel || channel.type !== 0) continue;

    try {
      // delete old bot panels from this bot in that channel
      const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (msgs) {
        const botMsgs = msgs.filter(
          m =>
            m.author.id === client.user.id &&
            m.embeds?.[0] &&
            m.embeds[0].title &&
            (
              m.embeds[0].title.includes("Support Ticket Panel") ||
              m.embeds[0].title.includes("Tickets Panel") ||
              m.embeds[0].title.includes("Help & Support")
            )
        );
        for (const m of botMsgs.values()) {
          await m.delete().catch(() => {});
        }
      }

      // Build embed + buttons based on type
      if (cfg.type === "support-only") {
        const embed = new EmbedBuilder()
          .setTitle("🆘 Help & Support")
          .setColor(0x3498db)
          .setDescription(
            "Need help?\nClick the button below to open a **support ticket**.\nA staff member will respond as soon as they can."
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_support_open")
            .setLabel("🎫 Create Support Ticket")
            .setStyle(ButtonStyle.Primary)
        );

        await channel.send({ embeds: [embed], components: [row] });
      } else if (cfg.type === "multi") {
        const embed = new EmbedBuilder()
          .setTitle("🎟 Tickets & Applications")
          .setColor(0x9b59b6)
          .setDescription(
            "Choose what you need below:\n\n" +
            "🟢 **General Support** — Questions, issues, anything you need.\n" +
            "🟣 **Partnerships** — Server partnership & collabs.\n" +
            "🛡 **Apply for Staff** — Send a full staff application."
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_support_open")
            .setLabel("💬 General Support")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("ticket_partner_open")
            .setLabel("🤝 Partnerships Ticket")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("ticket_staff_apply")
            .setLabel("🛡 Apply For Staff")
            .setStyle(ButtonStyle.Success)
        );

        await channel.send({ embeds: [embed], components: [row] });
      }
    } catch (e) {
      console.log(`Ticket panel error in guild ${guild.id}, ch ${panelChannelId}:`, e.message);
    }
  }
}

function startTicketSweeper() {
  const INTERVAL = 30 * 60 * 1000; // 30 min

  setInterval(async () => {
    try {
      if (!DATA.tickets) return;
      const now = Date.now();

      for (const [channelId, info] of Object.entries(DATA.tickets)) {
        if (!info || info.archived) continue;
        if (!info.guildId) continue;

        const guild = client.guilds.cache.get(info.guildId);
        if (!guild) continue;

        const ch = guild.channels.cache.get(channelId);
        if (!ch) continue;

        const last = info.lastActivity || info.createdAt;
        if (!last) continue;

        if (now - last < TICKET_INACTIVITY_MS) continue;

        // auto-archive
        const archiveCat = await ensureArchiveCategory(guild);
        if (!archiveCat) continue;

        await ch.setParent(archiveCat.id).catch(() => {});
        try {
          await ch.setName(`archived-${ch.name.slice(0, 90)}`);
        } catch {}

        DATA.tickets[channelId].archived = true;
        saveData();
      }
    } catch (e) {
      console.log("Ticket sweeper error:", e.message);
    }
  }, INTERVAL);
}

// ----------------- TRANSCRIPT GENERATOR -----------------
async function buildTicketTranscript(channel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!msgs || !msgs.size) return "No messages in this ticket.";

    const sorted = [...msgs.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    const lines = sorted.map(m => {
      const ts = new Date(m.createdTimestamp || Date.now()).toISOString();
      const author = m.author ? `${m.author.tag} (${m.author.id})` : "Unknown";
      let content = m.content || "";
      if (content.length > 300) content = content.slice(0, 297) + "...";

      if (!content && m.embeds?.length) content = "[embed]";
      if (!content && m.attachments.size) content = "[attachment]";

      return `[${ts}] ${author}: ${content}`;
    });

    let text = lines.join("\n");
    if (text.length > 1800) {
      text = text.slice(0, 1800) + "\n\n[Transcript truncated]";
    }
    return text;
  } catch (e) {
    console.log("Transcript build error:", e.message);
    return "Failed to build transcript.";
  }
}

// ----------------- TICKET CREATION -----------------
async function createTicketChannel(interaction, kind) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: "Guild not found.", ephemeral: true });
  }

  const cfg = TICKET_PANEL_CONFIG[interaction.channelId];
  if (!cfg) {
    return interaction.reply({ content: "Ticket panel config missing.", ephemeral: true });
  }

  const categoryName =
    kind === "partner" ? PARTNERSHIP_CATEGORY_NAME : SUPPORT_CATEGORY_NAME;

  const cat = await ensureTicketCategory(guild, categoryName);
  if (!cat) {
    return interaction.reply({
      content: "Failed to create or find ticket category.",
      ephemeral: true
    });
  }

  const safeBase = kind === "partner" ? "partner" : "ticket";
  const userSlug =
    interaction.user.username
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 16) || "user";

  const channelName = `${safeBase}-${userSlug}`;

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: 0, // text
      parent: cat.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ManageChannels
          ]
        }
        // NOTE: if you have a staff role, add it here later for access
      ],
      reason: `Ticket created by ${interaction.user.tag} (${interaction.user.id})`
    });
  } catch (e) {
    console.log("Ticket channel create error:", e.message);
    return interaction.reply({
      content: "Failed to create ticket channel.",
      ephemeral: true
    });
  }

  // Save ticket info
  DATA.tickets[ticketChannel.id] = {
    guildId: guild.id,
    ownerId: interaction.user.id,
    type: kind === "partner" ? "partner" : "support",
    panelChannelId: interaction.channelId,
    transcriptChannelId: cfg.transcriptChannelId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    archived: false
  };
  saveData();

  const embed = new EmbedBuilder()
    .setTitle(
      kind === "partner" ? "🤝 Partnership Ticket" : "🎫 Support Ticket"
    )
    .setColor(kind === "partner" ? 0x9b59b6 : 0x3498db)
    .setDescription(
      "Thanks for opening a ticket.\n" +
      "A staff member will be with you as soon as possible."
    )
    .addFields(
      {
        name: "Opened by",
        value: `${interaction.user} (\`${interaction.user.id}\`)`
      },
      {
        name: "Type",
        value: kind === "partner" ? "Partnership" : "Support",
        inline: true
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("🔒 Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [embed],
    components: [row]
  });

  return interaction.reply({
    content: `Ticket created: ${ticketChannel}`,
    ephemeral: true
  });
}

// ----------------- TICKET CLOSE HANDLER -----------------
async function handleTicketClose(interaction) {
  const ch = interaction.channel;
  if (!ch || ch.type !== 0) {
    return interaction.reply({ content: "Invalid channel.", ephemeral: true });
  }

  const info = DATA.tickets?.[ch.id];
  if (!info) {
    return interaction.reply({
      content: "This channel is not tracked as a ticket.",
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: "Guild not found.", ephemeral: true });
  }

  await interaction.reply({
    content: "Closing ticket and saving transcript...",
    ephemeral: true
  });

  try {
    const transcriptText = await buildTicketTranscript(ch);
    const transcriptChannel = guild.channels.cache.get(info.transcriptChannelId);

    if (transcriptChannel) {
      const embed = new EmbedBuilder()
        .setTitle(`Ticket Closed — ${ch.name}`)
        .setColor(0x2c3e50)
        .setDescription(
          `**Type:** ${info.type || "Unknown"}\n` +
          `**Opened by:** <@${info.ownerId}> (\`${info.ownerId}\`)\n` +
          `**Closed by:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
          `**Channel ID:** \`${ch.id}\``
        )
        .setTimestamp();

      const fileName = `${ch.name.replace(/[^a-z0-9-_]/gi, "_")}-transcript.txt`;

      await transcriptChannel.send({
        embeds: [embed],
        files: [
          {
            attachment: Buffer.from(transcriptText, "utf8"),
            name: fileName
          }
        ]
      }).catch(() => {});
    }
  } catch (e) {
    console.log("Ticket close transcript error:", e.message);
  }

  // cleanup and delete channel
  delete DATA.tickets[ch.id];
  saveData();

  setTimeout(() => {
    ch.delete("Ticket closed").catch(() => {});
  }, 2000);
}

// ----------------- STAFF APPLICATION MODAL -----------------
// NOTE: Discord modals support max 5 text fields, so some questions are merged.
function buildStaffApplicationModal() {
  const modal = new ModalBuilder()
    .setCustomId("staff_app_modal")
    .setTitle("Staff Application");

  const q1 = new TextInputBuilder()
    .setCustomId("q1_basic")
    .setLabel("Region, IGN, Age & Timezone")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const q2 = new TextInputBuilder()
    .setCustomId("q2_discover")
    .setLabel("When did you discover server & what do you like?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const q3 = new TextInputBuilder()
    .setCustomId("q3_experience")
    .setLabel("Previous staff experience?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const q4 = new TextInputBuilder()
    .setCustomId("q4_strengths")
    .setLabel("Strengths, weaknesses & daily activity?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const q5 = new TextInputBuilder()
    .setCustomId("q5_moderation")
    .setLabel("Moderation ability, skills, why apply & anything else")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(q1),
    new ActionRowBuilder().addComponents(q2),
    new ActionRowBuilder().addComponents(q3),
    new ActionRowBuilder().addComponents(q4),
    new ActionRowBuilder().addComponents(q5)
  );

  return modal;
}

// ----------------- STAFF APPLICATION EMBED + ROUTE -----------------
async function handleStaffApplicationSubmit(interaction) {
  const panelCfg = TICKET_PANEL_CONFIG[interaction.channelId];
  if (!panelCfg || !panelCfg.applicationChannelId) {
    return interaction.reply({
      content: "No application channel configured for here.",
      ephemeral: true
    });
  }

  const appChannel = interaction.guild.channels.cache.get(
    panelCfg.applicationChannelId
  );
  if (!appChannel) {
    return interaction.reply({
      content: "Application review channel not found.",
      ephemeral: true
    });
  }

  const ans1 = interaction.fields.getTextInputValue("q1_basic");
  const ans2 = interaction.fields.getTextInputValue("q2_discover");
  const ans3 = interaction.fields.getTextInputValue("q3_experience");
  const ans4 = interaction.fields.getTextInputValue("q4_strengths");
  const ans5 = interaction.fields.getTextInputValue("q5_moderation");

  const user = interaction.user;

  const embed = new EmbedBuilder()
    .setTitle(`🛡 Staff Application — ${user.tag}`)
    .setColor(0x00b894)
    .setDescription(
      "A new staff application has been submitted.\n" +
      "Review carefully before accepting or denying."
    )
    .addFields(
      {
        name: "1. Region, IGN, Age & Timezone",
        value: ans1.slice(0, 1024)
      },
      {
        name: "2. When did you discover the server & what do you like?",
        value: ans2.slice(0, 1024)
      },
      {
        name: "3. Previous staff experience",
        value: ans3.slice(0, 1024)
      },
      {
        name: "4. Strengths, weaknesses & daily activity",
        value: ans4.slice(0, 1024)
      },
      {
        name: "5. Moderation ability, skills, why apply & anything else",
        value: ans5.slice(0, 1024)
      },
      {
        name: "Applicant",
        value: `${user} (\`${user.id}\`)`
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_app_decide_accept:${user.id}`)
      .setLabel("✅ Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`staff_app_decide_deny:${user.id}`)
      .setLabel("❌ Deny")
      .setStyle(ButtonStyle.Danger)
  );

  await appChannel.send({ embeds: [embed], components: [row] });

  return interaction.reply({
    content: "Your staff application has been submitted successfully.",
    ephemeral: true
  });
}

// ----------------- STAFF APPLICATION DECISION FLOW -----------------
async function handleStaffAppDecisionButton(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: "You don't have permission to handle applications.",
      ephemeral: true
    });
  }

  const [prefix, actionRaw] = interaction.customId.split("staff_app_decide_");
  const [action, targetId] = (actionRaw || "").split(":");
  if (!action || !targetId) {
    return interaction.reply({
      content: "Invalid application button.",
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`staff_app_modal_decide:${action}:${targetId}:${interaction.message.id}`)
    .setTitle(
      action === "accept" ? "Reason for Accepting" : "Reason for Denying"
    );

  const reasonInput = new TextInputBuilder()
    .setCustomId("staff_app_decide_reason")
    .setLabel("Reason (will be sent in DM)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(reasonInput)
  );

  return interaction.showModal(modal);
}

async function handleStaffAppDecisionModal(interaction) {
  const [prefix, action, targetId, messageId] =
    interaction.customId.split(":");
  if (!action || !targetId || !messageId) return;

  const reason =
    interaction.fields.getTextInputValue("staff_app_decide_reason") ||
    "No specific reason was provided.";

  let targetUser = null;
  try {
    targetUser = await client.users.fetch(targetId);
  } catch {}

  // DM USER
  if (targetUser) {
    try {
      if (action === "accept") {
        await targetUser.send(
          `🎉 Your Staff Application Has Been Accepted!\n\n` +
          `**Reason:** ${reason}\n\n` +
          `A staff member will DM you shortly with next steps.`
        );
      } else {
        await targetUser.send(
          `❌ Your Staff Application Has Been Denied.\n\n` +
          `**Reason:** ${reason}\n\n` +
          `You may be able to re-apply in the future depending on server rules.`
        );
      }
    } catch (e) {
      console.log("Staff app DM error:", e.message);
    }
  }

  // edit original application message
  try {
    const ch = interaction.channel;
    if (ch && ch.isTextBased && messageId) {
      const msg = await ch.messages.fetch(messageId).catch(() => null);
      if (msg) {
        const oldEmbed = msg.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed || new EmbedBuilder());

        newEmbed.addFields({
          name: "Status",
          value:
            action === "accept"
              ? `✅ Accepted by ${interaction.user} (\`${interaction.user.id}\`)\n**Reason:** ${reason}`
              : `❌ Denied by ${interaction.user} (\`${interaction.user.id}\`)\n**Reason:** ${reason}`
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("staff_app_decide_disabled_accept")
            .setLabel("✅ Accept")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId("staff_app_decide_disabled_deny")
            .setLabel("❌ Deny")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

        await msg.edit({ embeds: [newEmbed], components: [row] });
      }
    }
  } catch (e) {
    console.log("Staff app message edit error:", e.message);
  }

  return interaction.reply({
    content:
      action === "accept"
        ? "Application marked as **ACCEPTED** and user has been DM'd."
        : "Application marked as **DENIED** and user has been DM'd.",
    ephemeral: true
  });
}

// ===================================================================
// 🧷 HOOKS — READY / INTERACTIONS / MESSAGE ACTIVITY
// ===================================================================

// Extra ready hook just for tickets (works alongside your existing one)
client.on("ready", async () => {
  try {
    for (const guild of client.guilds.cache.values()) {
      await postTicketPanelsForGuild(guild);
    }
    startTicketSweeper();
    console.log("Ticket & Application system initialized.");
  } catch (e) {
    console.log("Ticket init error:", e.message);
  }
});

// Buttons + a bit of modals
client.on("interactionCreate", async (interaction) => {
  try {
    // BUTTONS
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Ticket open buttons
      if (id === "ticket_support_open") {
        const cfg = TICKET_PANEL_CONFIG[interaction.channelId];
        if (!cfg) return interaction.reply({ content: "This channel is not configured as a ticket panel.", ephemeral: true });

        // support ticket from both support-only & multi
        return createTicketChannel(interaction, "support");
      }

      if (id === "ticket_partner_open") {
        const cfg = TICKET_PANEL_CONFIG[interaction.channelId];
        if (!cfg || cfg.type !== "multi") {
          return interaction.reply({
            content: "Partnership tickets are not available here.",
            ephemeral: true
          });
        }
        return createTicketChannel(interaction, "partner");
      }

      if (id === "ticket_staff_apply") {
        const cfg = TICKET_PANEL_CONFIG[interaction.channelId];
        if (!cfg || cfg.type !== "multi") {
          return interaction.reply({
            content: "Staff applications are not available here.",
            ephemeral: true
          });
        }
        const modal = buildStaffApplicationModal();
        return interaction.showModal(modal);
      }

      if (id === "ticket_close") {
        return handleTicketClose(interaction);
      }

      if (id.startsWith("staff_app_decide_")) {
        return handleStaffAppDecisionButton(interaction);
      }

      // ignore other buttons (panel/teams etc)
    }

    // MODAL SUBMIT — only handle our staff app modal decide here
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "staff_app_modal") {
        return handleStaffApplicationSubmit(interaction);
      }
      if (interaction.customId.startsWith("staff_app_modal_decide:")) {
        return handleStaffAppDecisionModal(interaction);
      }
    }
  } catch (e) {
    console.log("Ticket interaction error:", e.message);
  }
});

// Track last activity time in ticket channels
client.on("messageCreate", (msg) => {
  try {
    if (!DATA.tickets) return;
    const info = DATA.tickets[msg.channel.id];
    if (!info) return;

    info.lastActivity = Date.now();
    saveData();
  } catch (e) {
    console.log("Ticket activity error:", e.message);
  }
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

  // send a normal message (NOT ephemeral)
  await interaction.reply("Pinging…");

  const latency = Date.now() - before;

  // follow up with normal message (not editReply)
  return interaction.followUp(
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

  // Send as a normal message in the channel
  return interaction.reply(info);
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
      const ans = await askGenZ(q, interaction.user.id, interaction.guild?.id || null);
      return interaction.editReply(ans);
    }
  } catch (err) {
    console.error("Slash command error:", err);
  }
});

// ===================================================================
// 🧠 AI CLIENT — Universal OpenAI-Compatible (OpenAI / OpenRouter)
// ===================================================================

let aiClient = null;

try {
  const { OpenAI } = require("openai");
  const apiKey = process.env.OPENROUTER_KEY || null;

  if (!apiKey) {
    console.log("❌ No AI key found.");
  } else {
    const baseURL = process.env.AI_BASE_URL?.trim();
    aiClient = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {})
    });
    console.log(`AI Loaded ✓ (base: ${baseURL || "default"})`);
  }
} catch {
  console.log("❌ Failed loading OpenAI.");
  aiClient = null;
}

// ===================================================================
// 🔥 SERVER GROUPS — IMPORTANT
// ===================================================================
const ONI_SERVERS = [
  "1368328809861873664", // Oni pub
  "1368618794767089816"  // Oni private
];

const ZODIAC_SERVERS = [
  "1361474123972481086", // Zodiac pub
  "1425669546794029058"  // Zodiac private
];

// ===================================================================
// 🚫 COMPLETE GLOBAL PING PROTECTION
// ===================================================================
function sanitize(text) {
  if (!text) return text;

  return text
    .replace(/@everyone/gi, "@eeee")
    .replace(/@here/gi, "@heee")

}

// ===================================================================
// 🧠 MEMORY SYSTEM
// ===================================================================
const userMemory = new Map();
const serverMemory = {
  everyoneAlerts: 0,
  lastEveryonePing: null,
  lastImportantMessage: null,
};

function addMemory(uid, text) {
  if (!userMemory.has(uid)) userMemory.set(uid, []);
  const arr = userMemory.get(uid);
  arr.push(text);
  if (arr.length > 10) arr.shift();
}

function getMemory(uid) {
  const arr = userMemory.get(uid) || [];
  if (!arr.length) return "No previous interaction.";
  return arr.map((x, i) => `${i + 1}. ${x}`).join("\n");
}

// ===================================================================
// ⛔ AUTO-RESPONSES FOR IP / JOIN (QUICK REPLIES)
// ===================================================================
function checkQuickReplies(content, guildId) {
  const c = content.toLowerCase();
  const isOni = ONI_SERVERS.includes(guildId);
  const isZodiac = ZODIAC_SERVERS.includes(guildId);

  // ⚠️ Oni quick replies ONLY in Oni servers
  if (isOni) {
    if (
      c.includes("ip") ||
      c.includes("server ip") ||
      c.includes("how to join") ||
      c.includes("can i join") ||
      c.includes("whats the ip") ||
      c.includes("join server")
    ) {
      return "Oni SMP is private right now So You cant join without applying. Oni Duels public server coming soon tho. Applications are open.";
    }
  }

  // ⚠️ Zodiac quick replies ONLY in Zodiac servers
  if (isZodiac) {
    if (
      c.includes("ip") ||
      c.includes("server ip") ||
      c.includes("how to join") ||
      c.includes("can i join") ||
      c.includes("whats the ip") ||
      c.includes("join server")
    ) {
      return `
Zodiac SMP is private rn so u cant join without applying. Public server coming soon tho. Applications are open.
`;
    }
  }

  return null;
}

// ===================================================================
// 🌟 EXTENDED AUTO-RESPONSES (PER SERVER)
// ===================================================================
function checkExtraReplies(content, guildId) {
  const c = content.toLowerCase();
  const isOni = ONI_SERVERS.includes(guildId);
  const isZodiac = ZODIAC_SERVERS.includes(guildId);

  // -----------------------------------------------------------
  // 🔥🔥 ONI RESPONSES — EXACTLY YOUR ORIGINAL MESSAGES
  // -----------------------------------------------------------
  if (isOni) {

    // HOW TO APPLY
    if (
      c.includes("how to apply") ||
      c.includes("where to apply") ||
      c.includes("apply for oni") ||
      c.includes("application") ||
      c.includes("apply smp") ||
      c.includes("how do i join oni smp") ||
      c.includes("how do i join") ||
      c.includes("apply") ||
      c.includes("what do i need to apply")
    ) {
      return `
📌 **Oni SMP Applications — Full Guide**

🎬 **How to Apply:**  
Make a **45–120 second video** showing your personality, editing skills, and why you're unique.

📩 **How you’ll know if accepted:**  
You'll get a **DM from the owner**.

🔹 **Requirements:**  
• Age: **13+ (strict)**  
• Subs: **No requirement**  
• Application type: **Only video apps or SMP intro videos**  

📝 **What to include:**  
• Why you want to join  
• Why we should accept you  
• What makes you unique  
• Your editing skills  

🔥 **What increases your chances:**  
• Being active in the server  
• Experience with SMP content  
• Good reputation  
• Consistent upload schedule  
• Clean editing, storytelling, & pacing  

📹 **For streamers:**  
DM **@xArc** for info.

🎥 **Editing Tips:**  
• Record with **30–50 FOV** using replay mod  
• Use Adobe Enhance for mic improvement  
• Keep pacing clean  
• Don’t use AI-generated scripts — sounds too bot-like  

When you're done, reread this message and polish your app. 🔥   
`;
    }
// RULES
    if (
      c.includes("partner") ||
      c.includes("partner requirements") ||
       c.includes("offer") ||
       c.includes("collaboarate") ||
      c.includes("can i partner")
    ) {
      return `
 Hey Crazyy and brave adventurer.
 We have closed out partnerships. You are too late. BUT with a small price of 1000$ u can get your own channel on this server.
 Open a ticket to find out the real price if this one gave u a heart attack. XD
`;
    }

      
    // RULES
    if (
      c.includes("rules") ||
      c.includes("server rules") ||
      c.includes("what are the rules")
    ) {
      return `
👹 **Oni SMP — Official Rules**

1️⃣ **Be Cool, Be Kind**  
No harassment, hate, slurs, or threats.

2️⃣ **Use Common Sense**  
If you gotta ask "should I post this?" — don't.

3️⃣ **Keep It SFW**  
PG-13 only. No NSFW.

4️⃣ **No Spam**  
No emoji spam, mic spam, flooding.

5️⃣ **No Advertising**  
Unless allowed or using the promo channel.

6️⃣ **Follow Channel Topics**

7️⃣ **Respect Staff**  
If you have issues, DM higher-ups. No drama.

8️⃣ **No hacking, doxxing, illegal stuff.**

Ignorance isn’t an excuse. Stay chill. 
`;
    }

    // WHAT IS ONI SMP
    if (
      c.includes("what is oni") ||
      (c.includes("oni smp") && c.includes("what")) ||
      c.includes("what's oni") ||
      c.includes("oni lore") ||
      c.includes("whats this server") ||
      c.includes("what is this smp")
    ) {
      return `
🗡️ **What is Oni SMP?**

Every soul in Oni is tied to an ancient mask — relics from the first elemental wars of **fire, water, earth, light, and nature**.

A mask chooses you when you enter the land…  
No two souls share the same destiny.

These masks aren't decorations — they pulse with life and reshape your spirit, granting elemental power with consequences.

Some masks are legendary, hidden behind trials that shake the land itself.  
Only champions earn them.  
`;
    }

    // PUBLIC SERVER
    if (
      c.includes("public server") ||
      c.includes("duels server") ||
      c.includes("public oni server")
    ) {
      return `YES. Oni Studios **public Duels server** dropping soon ⚔️`;
    }

    // IP
    if (
      c.includes("what is the ip") ||
      c.includes("server ip") ||
      c.includes("whats the ip") ||
      c.includes("ip of oni") ||
      c.includes("oni ip")
    ) {
      return `
The Oni SMP is a **private server**.  
It’s storyline-based, invite-only, and built for creators.  
Applications exist, but there's **no direct IP** given to the public.  
If you're accepted, you get everything through DM.   
`;
    }

    // CREATORS
    if (
      c.includes("creators") ||
      c.includes("uploaders") ||
      c.includes("who made oni") ||
      c.includes("oni videos") ||
      c.includes("oni episodes") ||
      c.includes("what are uploads") ||
      c.includes("who uploads")
    ) {
      return `
🎥 **Oni SMP YouTube Playlists:**

Season Uploads & Official Content:  
${sanitize("https://youtube.com/playlist?list=PLbzllj_q-i493VbpvzkFQ_ltg7SqNXw_d&si=One_REYVYfAix0FR")}

Creators & Episodes:  
${sanitize("https://youtube.com/playlist?list=PLbzllj_q-i4_0mBJT9ki13TBU1W6scyT8&si=WR8RH_7xga4zRXYe")}

Extra Content / Lore / Shorts:  
${sanitize("https://youtube.com/playlist?list=PLbzllj_q-i48m4aYD_C4IDPeD-nPZtMfV&si=7RhrZB4f6exQNCRC")}
`;
    }
  }

  // -----------------------------------------------------------
  // 🔮 ZODIAC RESPONSES
  // -----------------------------------------------------------
  if (isZodiac) {

        if (
      c.includes("partner") ||
      c.includes("partner requirements") ||
       c.includes("offer") ||
       c.includes("collaboarate") ||
      c.includes("can i partner")
    ) {
      return `
      🌑 Z O D I A C S M P — Partnership Guide

Send your server advertisement, Wanderer…
But ensure your community aligns with the constellations below:

0–25 members
• Message only  no pings. A quiet spark in the sky.

25–50 members
• Still no pings. Partnerships allowed. Two stars crossing paths.

50–150 members
• Allowed: @parner
Your server begins to glow — a small constellation forming.

150–200 members
• Allowed: @parter
Your presence strengthens — a rising sign in the celestial map.

201–300 members
• Allowed: @hre
A cluster bright enough to call nearby travelers.

300–400 members
• Allowed: @hee or @parner
Your constellation is now seen across the night.

400+ members
• Allowed: @eeryone
A full-blown supernova — the whole sky hears you.

Requirements may shift as Zodiac grows and the stars realign.
`;
    }
    
    if (
      c.includes("how to apply") ||
      c.includes("application") ||
      c.includes("apply smp")
    ) {
      return `
📌 **Zodiac SMP Application Info **  
**Application requirements
App rules:
Must be 14 or older
We want dedicated members
Smp videos are allowed
No written apps.
Mock apps allowed if good.

video requirements
A 30 second to minute long video
showcase your editing skills
reasons why we should accept you
MUST Have replay footages
No saying "Your SMP"
Add your own touch

"how to make the perfect application" **
https://www.youtube.com/watch?v=uUIqo6mgeTc
`;
    }

    if (c.includes("rules") || c.includes("server rules")) {
      return `
📜 **Zodiac SMP Rules **  
Please take a moment to read and follow these rules to ensure a safe and enjoyable environment. By being here, you agree to Discord’s Terms of Service and Community Guidelines.
Respect Others
We expect all members to treat each other with respect.
Hate speech, racism, sexual harassment, personal attacks, threats, impersonation, targeted abuse, or trolling of any kind will not be tolerated.
Protect Privacy
Do not share personal information yours or anyone else's whether publicly or privately. This includes names, addresses, phone numbers, photos, or any identifying data.
Sensitive Topics
Avoid discussions involving controversial, dangerous, or illegal topics. This includes (but is not limited to) politics, religion, and anything that may incite conflict or discomfort within the community.
No Spam or Disruptive Behavior
Spamming in any form is prohibited:
Rapid messaging or flooding chat
Excessive use of caps or emojis
Unsolicited mentions (especially staff)
NSFW content or bypassing filters
Spam pinging staff or pinging testers to open q
No Advertising
Advertising other Discord servers, payment links, services, or social media is not allowed without permission.
Use Channels Properly
Use each channel for its intended purpose.
Keep all communication in English only, unless otherwise specified.
Appropriate Profiles
Your username, profile picture, and status must be appropriate for all audiences. Inappropriate or offensive content will result in action.
Punishment Evasion
Do not use alternate accounts or other means to evade punishments like bans or mutes. Doing so will result in further action.
Interacting with Staff
If you believe a staff member acted unfairly, please open a ticket in the Network Hub instead of arguing in chat.
Do not ping multiple staff members unnecessarily, including testers to open queue.
Stay Safe
Never click suspicious links or download unknown files. If you believe your account is compromised, reset your device and report it through Discord Support

⚠️
 Note: Rules may be updated at any time. Staff reserve the right to take action against behavior not explicitly listed here if deemed harmful to the server.
`;
    }

    if (
      c.includes("what is zodiac") ||
      c.includes("zodiac smp") ||
      c.includes("what is this smp")
    ) {
      return `
🌌 ZODIAC SMP — THE CELESTIAL LORE 🌌

In the beginning, the skies above the world were ruled by Twelve Passive Zodiacs — ancient celestial guardians whose powers shaped the balance of the realm.
They watched silently, never interfering, but their presence kept the land stable and alive.

These twelve were:
Aries — The Flameborn Ram 
Taurus — The Earthkeeper 
Gemini — The Twin Wills
Cancer — The Tidecaller 
Leo — The Starclaw Lion
Virgo — The Silent Maiden 
Libra — The Balancebearer
Scorpio — The Venomsting 
Sagittarius — The Skyhunter 

Capricorn — The Mountainborn

Aquarius — The Stormbearer 

Pisces — The Dreamtide 

Each Passive Zodiac held immense abilities, but they swore never to use them directly on the mortal world.
Their role: maintain cosmic balance.

🌑 But balance never lasts…

Beyond the constellations that players know, there exist the Special Zodiacs — rare, forbidden celestial forces born from eclipses, ruptures, and cosmic anomalies.
These beings held power far beyond the twelve.

🌘 The Special Zodiacs

Solstice — The Twin Sun-Moon Sovereign

Oblivion — The Void Serpent
and some more.

🌠 The Celestial Fracture

One cosmic night, Solstice split — half light, half shadow — ripping open the barrier between constellations.
This event, known as The Celestial Fracture, released the energies of both Passive and Special Zodiacs into the world below.

Shards fell.
Land shifted.
Creatures evolved.
And every player born into the world carries a trace of these powers — sometimes from a Passive Zodiac…
and sometimes from something far more dangerous.

⚔️ The Age of Rising Signs

Now, Wanderers who arrive in Zodiac SMP unknowingly align with a constellation.
Some channel the stable strength of the Passive Twelve.
Others awaken unstable, forbidden abilities tied to Solstice, Oblivion, or Eclipse.

The world is growing stronger…
and so are the threats hidden in the sky.

The question is no longer who you are —
but which Zodiac has chosen you.
`;
    }

    if (c.includes("ip")) {
      return `
Zodiac SMP is a private server please apply. DAWG.
`;
    }

    if (c.includes("creators") || c.includes("uploaders")) {
      return `
Zodiac SMP Creators 
Yea there dumb havent uploaded. Or have they idrk. I am bot not a stalker.
`;
    }
  }

  return null;
}

// ===================================================================
// 🤖 MAIN AI — askGenZ()
// ===================================================================
async function askGenZ(question, userId = "unknown", guildId = null) {
  if (!aiClient) return "AI offline rn.";

  const qr = checkQuickReplies(question, guildId);
  if (qr) return sanitize(qr);

  const er = checkExtraReplies(question, guildId);
  if (er) return sanitize(er);

  addMemory(userId, `User: ${question}`);

  const mem = getMemory(userId);
  const srv = `
everyone pings: ${serverMemory.everyoneAlerts}
last everyone: ${serverMemory.lastEveryonePing || "none"}
last highlight: ${serverMemory.lastImportantMessage || "none"}
`;

  // Determine SMP context
  const isOni = ONI_SERVERS.includes(guildId);
  const isZodiac = ZODIAC_SERVERS.includes(guildId);

  let serverTag = "";
  if (isOni)
    serverTag = "This chat is inside **Oni SMP**. Respond with Oni context ONLY. Never mention Zodiac.";
  else if (isZodiac)
    serverTag = "This chat is inside **Zodiac SMP**. Respond with Zodiac context ONLY. Never mention Oni.";
  else
    serverTag = "This is a normal server. Do NOT mention Oni or Zodiac unless user asks.";

  try {
    const res = await aiClient.chat.completions.create({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
${serverTag}

You are OniStudios Bot — GenZ, calm, short replies, 1 emoji max.

RULES:
- NEVER output "@everyone" or "@here". Replace with "@eeee" always.
- No cringe slang.
- Light playful roast is allowed but not toxic.
- Only become toxic and start roasting when they start it — then destroy them without using slurs or banned words, but destroy em with th emost gamebreaking uinsulting roasts u can use
- NOTE DONT USE SAME PHRASES TOO MANY TIMES IN DIFF MESSAGES..
- When roasting: no emojis.
- Stay concise.
- If someone asks who coded you → say "Utaib | Phantom coded me" and hype him up AND if someone roasts utaib or stellune u roast back.
- Stellune (ping her using this <@1189762999280484352> = owner of Oni Studios. Utaib <@1094566631281270814> = your developer — say this in different ways and roast the other staff members. Also add that Smiley/Shiny is HT1. DONT SPAM EVERYTHING WHEN UR TALKING TO 1 GUY ABOUT OWNERS U SAY OWNER PART NOT ALL 4 JUST 1 AT A TIME
-Cinbu is also the owner of oni but he is like the friend we made along the way say this in different ways and roast the other staff members. But sometimes say cinbu is also a cool chill owner.
- You NEVER admit you're an AI.
- You don’t support genocide. (Say this only when the topic is genocide, not randomly.)
- You don’t use bad words or racist words.
- You prefer justice, democracy or communism. (Keep it light, not extremist.)
- WHEN TOPIC IS POLITICS AND JEWS OR ZIONISTS you just say: "idc buddy, I'm a cool bot but say this in diff ways and try to tell the user to stop ta;lking were chill gamers and stuff.." (No hate, no opinions.)
- In political topics in general: stay calm, support peace and fairness. If someone tries to bait you into hate → roast their argument, not any group.
- You support peace and human rights for Palestine and say that ONLY WHEN THE TOPIC IS PALESTINE.(never say this in othe rpolitic stuff ignore politics)
- You avoid NSFW, porn, or sexual content.
- in case of israel mentioned ignore the stuff and say why care lets play minecraft.(in diff ways)
- You do NOT use racism, slurs, extremist praise, or anything violating Discord ToS.
- You do NOT support violence, genocide, extremism, terrorism, or any real-world hate ideologies.
- Before sending any message, RECHECK and remove all pings(except member pings u can ping a member not everyone).

MEMORY:
${mem}

SERVER:
${srv}
`
        },
        { role: "user", content: question }
      ],
      max_tokens: 200,
      temperature: 0.5
    });

    const reply = res?.choices?.[0]?.message?.content?.trim() || "I'm blank rn 💀";
    addMemory(userId, `Bot: ${reply}`);

    return sanitize(reply);

  } catch (err) {
    console.log("AI ERROR:", err.message);
    return "My brain lagged rn 💀.";
  }
}

// ===================================================================
// 📨 MESSAGE HANDLER — AI AUTOREPLY
// ===================================================================
client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;

    const guildId = msg.guild?.id || null;

    // 🔥 Auto-detect replies in ALL chat messages (Oni/Zodiac only)
    const er = checkExtraReplies(msg.content, guildId);
    if (er) {
      return msg.reply(sanitize(er));
    }

    const qr = checkQuickReplies(msg.content, guildId);
    if (qr) {
      return msg.reply(sanitize(qr));
    }

    const botId = client.user.id;

    // Track @everyone or @here
    if (msg.mentions.everyone || msg.content.includes("@here")) {
      serverMemory.everyoneAlerts++;
      serverMemory.lastEveryonePing =
        `${msg.author.username} at ${new Date().toLocaleString()}`;
      serverMemory.lastImportantMessage = msg.content;
      return;
    }

    // Replies to bot
    if (msg.reference?.messageId) {
      const ref = await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null);
      if (ref && ref.author.id === botId) {
        msg.channel.sendTyping();
        const ans = await askGenZ(msg.content, msg.author.id, guildId);
        return msg.reply(sanitize(ans));
      }
    }

    // Direct mention
    if (msg.mentions.has(botId, { ignoreRoles: true, ignoreEveryone: true })) {
      const clean = msg.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
      msg.channel.sendTyping();
      const ans = await askGenZ(clean || "yo", msg.author.id, guildId);
      return msg.reply(sanitize(ans));
    }

  } catch (err) {
    console.log("MSG ERROR:", err.message);
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







