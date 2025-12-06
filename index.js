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
// 🎟️ TICKETS + APPLICATION SYSTEM (FIXED BY UTAIB FF & CHATGPT BRO)
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

  // MULTI PANELS (SUPPORT + PARTNERSHIP + STAFF APPS)
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

// 3 days
const TICKET_INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000;

// OPTIONAL: staff ping role (set to role ID if you want ping on new tickets)
const STAFF_PING_ROLE_ID = null; // e.g. "123456789012345678"

DATA.tickets = DATA.tickets || {};
DATA.partialStaffApps = DATA.partialStaffApps || {};
DATA.staffPanels = DATA.staffPanels || {}; // which panel user started on

// ================================================================
// HELPERS
// ================================================================
function clean(s) {
  return (s || "").trim().replace(/\n/g, " ").replace(/\s+/g, " ");
}

async function ensureTicketCategory(guild, name) {
  if (!guild) return null;
  let cat = guild.channels.cache.find(c => c.type === 4 && c.name === name);
  if (cat) return cat;

  try {
    return await guild.channels.create({ name, type: 4 });
  } catch (e) {
    console.log("Category error:", e.message);
    return null;
  }
}

async function ensureArchiveCategory(guild) {
  return ensureTicketCategory(guild, ARCHIVE_CATEGORY_NAME);
}

function getPanelConfigFromInteraction(interaction) {
  return TICKET_PANEL_CONFIG[String(interaction.channelId)];
}

// ================================================================
// PANEL POSTING (NO REPOST SPAM)
// ================================================================
async function postTicketPanelsForGuild(guild) {
  if (!guild?.available) return;

  for (const [channelId, cfg] of Object.entries(TICKET_PANEL_CONFIG)) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== 0) continue;

    try {
      const msgs = await channel.messages.fetch({ limit: 20 });
      const old = msgs.filter(m => m.author.id === client.user.id);

      // if bot already posted something here, skip
      if (old.size > 0) continue;

      // SUPPORT-ONLY PANEL
      if (cfg.type === "support-only") {
        const embed = new EmbedBuilder()
          .setTitle("🆘 Help & Support")
          .setColor(0x3498db)
          .setDescription(
            "Need help with **anything**?\n" +
            "Click the button below to create a support ticket.\n\n" +
            "A staff member will assist you as soon as possible."
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_support_open")
            .setLabel("🎫 Create Support Ticket")
            .setStyle(ButtonStyle.Primary)
        );

        await channel.send({ embeds: [embed], components: [row] });
      }

      // MULTI PANEL (SUPPORT + PARTNERSHIP + STAFF)
      if (cfg.type === "multi") {
        const embed = new EmbedBuilder()
          .setTitle("🎟 Tickets & Applications")
          .setColor(0x9b59b6)
          .setDescription(
            "Choose what you need:\n\n" +
            "💬 **Support Ticket** – General help & issues\n" +
            "🤝 **Partnership Ticket** – Server / org partnerships\n" +
            "🛡 **Staff Application** – Apply to become staff"
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_support_open")
            .setLabel("💬 Support")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("ticket_partner_open")
            .setLabel("🤝 Partnership")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("ticket_staff_apply")
            .setLabel("🛡 Apply for Staff")
            .setStyle(ButtonStyle.Success)
        );

        await channel.send({ embeds: [embed], components: [row] });
      }
    } catch (e) {
      console.log("Panel post error:", e.message);
    }
  }
}

// ================================================================
// TICKET MODALS (SUPPORT + PARTNERSHIP + CLOSE)
// ================================================================
function buildSupportTicketModal() {
  const m = new ModalBuilder()
    .setCustomId("support_ticket_modal")
    .setTitle("Support Ticket");

  m.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("support_name")
        .setLabel("Your IGN / Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("support_issue")
        .setLabel("What do you need help with?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );

  return m;
}

function buildPartnerTicketModal() {
  const m = new ModalBuilder()
    .setCustomId("partner_ticket_modal")
    .setTitle("Partnership Ticket");

  m.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("partner_name")
        .setLabel("Your Name / Server Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("partner_discord")
        .setLabel("Your Discord Tag / ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("partner_link")
        .setLabel("Server / Project Link")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("partner_details")
        .setLabel("Partnership Details")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );

  return m;
}

function buildCloseTicketModal() {
  const m = new ModalBuilder()
    .setCustomId("ticket_close_modal")
    .setTitle("Close Ticket");

  m.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("ticket_close_reason")
        .setLabel("Reason for closing")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    )
  );

  return m;
}

// ================================================================
// CREATE TICKET CHANNEL
// ================================================================
async function createTicketChannel(interaction, type, formData) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({
      content: "I couldn't detect the guild.",
      ephemeral: true
    });
  }

  const panelCfg = getPanelConfigFromInteraction(interaction);
  if (!panelCfg || !panelCfg.transcriptChannelId) {
    return interaction.reply({
      content: "Ticket configuration missing for this panel.",
      ephemeral: true
    });
  }

  let categoryName;
  if (type === "support") categoryName = SUPPORT_CATEGORY_NAME;
  else if (type === "partner") categoryName = PARTNERSHIP_CATEGORY_NAME;
  else categoryName = SUPPORT_CATEGORY_NAME;

  const category = await ensureTicketCategory(guild, categoryName);
  if (!category) {
    return interaction.reply({
      content: "Couldn't create/find the ticket category.",
      ephemeral: true
    });
  }

  const baseName =
    type === "partner"
      ? `partner-${interaction.user.username}` 
      : `ticket-${interaction.user.username}`;

  const channelName = baseName.toLowerCase().replace(/[^a-z0-9\-]/g, "").slice(0, 90);

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName || "ticket",
      type: 0,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: ["ViewChannel"]
        },
        {
          id: interaction.user.id,
          allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"]
        }
      ]
    });
  } catch (e) {
    console.log("Ticket channel create error:", e.message);
    return interaction.reply({
      content: "Failed to create ticket channel.",
      ephemeral: true
    });
  }

  const embed = new EmbedBuilder()
    .setColor(type === "partner" ? 0xf1c40f : 0x3498db)
    .setTitle(
      type === "partner" ? "🤝 Partnership Ticket" : "🎫 Support Ticket"
    )
    .setDescription(
      type === "partner"
        ? "Thanks for reaching out for a partnership.\nA staff member will review your request soon."
        : "Thanks for opening a support ticket.\nA staff member will be with you shortly."
    )
    .addFields(
      { name: "Opened By", value: `${interaction.user}`, inline: true },
      { name: "User ID", value: interaction.user.id, inline: true }
    )
    .setTimestamp();

  // Add form data fields
  if (type === "support") {
    embed.addFields(
      { name: "IGN / Name", value: formData.name || "N/A" },
      { name: "Issue", value: formData.issue || "N/A" }
    );
  } else if (type === "partner") {
    embed.addFields(
      { name: "Name / Server", value: formData.name || "N/A" },
      { name: "Discord", value: formData.discord || "N/A" },
      { name: "Link", value: formData.link || "N/A" },
      { name: "Details", value: formData.details || "N/A" }
    );
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("🔒 Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );

  const components = [row];

  let content = "";
  if (STAFF_PING_ROLE_ID) {
    content = `<@&${STAFF_PING_ROLE_ID}> New ${type === "partner" ? "partnership" : "support"} ticket.`;
  }

  await ticketChannel.send({
    content,
    embeds: [embed],
    components
  });

  // Save ticket info
  DATA.tickets[ticketChannel.id] = {
    type,
    userId: interaction.user.id,
    guildId: guild.id,
    panelChannelId: interaction.channelId,
    transcriptChannelId: panelCfg.transcriptChannelId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    archived: false
  };
  saveData();

  return interaction.reply({
    content: `Your ${type === "partner" ? "partnership" : "support"} ticket has been created: ${ticketChannel}.`,
    ephemeral: true
  });
}

// ================================================================
// TRANSCRIPT + ARCHIVE / DELETE HELPERS
// ================================================================
async function sendTranscriptEmbed(ticketChannel, ticketInfo, options = {}) {
  const guild = ticketChannel.guild;
  if (!guild) return;

  const transcriptChannelId = ticketInfo.transcriptChannelId;
  if (!transcriptChannelId) return;

  const transcriptChannel = guild.channels.cache.get(transcriptChannelId);
  if (!transcriptChannel || transcriptChannel.type !== 0) return;

  let messages;
  try {
    messages = await ticketChannel.messages.fetch({ limit: 100 });
  } catch (e) {
    console.log("Transcript fetch error:", e.message);
    return;
  }

  const ordered = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = [];
  for (const msg of ordered.values()) {
    const time = new Date(msg.createdTimestamp).toISOString().replace("T", " ").split(".")[0];
    const content = msg.content || "";
    if (!content) continue;
    lines.push(`[${time}] ${msg.author.tag}: ${content}`);
  }

  let transcriptText = lines.join("\n");
  if (transcriptText.length > 3800) {
    transcriptText = transcriptText.slice(0, 3800) + "\n... (truncated)";
  }

  let closedFieldValue;
  if (options.auto) {
    closedFieldValue = "Auto-archived after 3 days of inactivity.";
  } else if (options.closedBy) {
    closedFieldValue =
      `Closed & deleted by ${options.closedBy}` +
      (options.reason ? `\nReason: ${options.reason}` : "");
  } else {
    closedFieldValue = "Closed.";
  }

  const embed = new EmbedBuilder()
    .setTitle("📑 Ticket Transcript")
    .setColor(0x95a5a6)
    .addFields(
      { name: "Channel", value: `${ticketChannel} (${ticketChannel.id})` },
      { name: "Type", value: ticketInfo.type || "Unknown", inline: true },
      { name: "Opened By", value: `<@${ticketInfo.userId}>`, inline: true },
      {
        name: "Closed",
        value: closedFieldValue
      }
    )
    .setTimestamp();

  if (transcriptText.length > 0) {
    embed.addFields({
      name: "Recent Messages",
      value: "```txt\n" + transcriptText + "\n```"
    });
  }

  await transcriptChannel.send({ embeds: [embed] });
}

async function archiveTicket(ticketChannel, ticketInfo, options = {}) {
  if (!ticketChannel || !ticketChannel.guild) return;

  if (ticketInfo.archived) return;
  ticketInfo.archived = true;
  saveData();

  await sendTranscriptEmbed(ticketChannel, ticketInfo, { auto: true }).catch(() => {});

  const archiveCategory = await ensureArchiveCategory(ticketChannel.guild);
  if (archiveCategory) {
    try {
      await ticketChannel.setParent(archiveCategory.id, { lockPermissions: false });
      await ticketChannel.setName(`archived-${ticketChannel.name}`.slice(0, 90));
    } catch (e) {
      console.log("Archive move error:", e.message);
    }
  }

  // Lock user out of channel
  try {
    if (ticketInfo.userId) {
      await ticketChannel.permissionOverwrites.edit(ticketInfo.userId, {
        ViewChannel: false,
        SendMessages: false
      });
    }
  } catch (e) {
    console.log("Archive perms error:", e.message);
  }

  try {
    await ticketChannel.send({
      content: "This ticket has been **auto-archived** after 3 days of inactivity."
    });
  } catch {}
}

async function deleteTicket(ticketChannel, ticketInfo, options = {}) {
  if (!ticketChannel || !ticketChannel.guild) return;

  await sendTranscriptEmbed(ticketChannel, ticketInfo, {
    closedBy: options.closedBy,
    reason: options.reason,
    auto: false
  }).catch(() => {});

  try {
    await ticketChannel.delete(`Ticket closed (manual)`);
  } catch (e) {
    console.log("Ticket delete error:", e.message);
  }

  delete DATA.tickets[ticketChannel.id];
  saveData();
}

// CLOSE VIA MODAL (DELETE)
async function handleTicketCloseModal(interaction) {
  const info = DATA.tickets[interaction.channel.id];
  if (!info) {
    return interaction.reply({
      content: "This channel is not registered as a ticket.",
      ephemeral: true
    });
  }

  const raw = interaction.fields.getTextInputValue("ticket_close_reason") || "";
  const reason = clean(raw) || "Resolved";

  // DM user simple
  try {
    const user = await client.users.fetch(info.userId);
    const dateStr = new Date().toLocaleString();
    await user.send(
      `Your ticket has been closed by ${interaction.user}.\n` +
      `Date: ${dateStr}\n` +
      `Reason: ${reason}`
    );
  } catch (e) {
    console.log("Ticket close DM error:", e.message);
  }

  // Acknowledge to staff
  await interaction.reply({
    content: "Ticket is being closed & deleted.",
    ephemeral: true
  });

  // Delete ticket with transcript
  await deleteTicket(interaction.channel, info, {
    closedBy: interaction.user,
    reason
  });
}

// AUTO SWEEPER (ARCHIVE AFTER 3 DAYS)
function startTicketSweeper() {
  setInterval(async () => {
    try {
      if (!DATA.tickets) return;
      const now = Date.now();

      for (const [channelId, info] of Object.entries(DATA.tickets)) {
        if (!info || info.archived) continue;

        const guild = client.guilds.cache.get(info.guildId);
        if (!guild) continue;

        const channel = guild.channels.cache.get(channelId);
        if (!channel) continue;

        const last = info.lastActivity || info.createdAt || now;
        if (now - last >= TICKET_INACTIVITY_MS) {
          console.log("Auto-archiving inactive ticket:", channelId);
          await archiveTicket(channel, info, { auto: true });
        }
      }
    } catch (e) {
      console.log("Ticket sweeper error:", e.message);
    }
  }, 60 * 60 * 1000); // every 1 hour
}

// ================================================================
// STAFF APPLICATION — 2-PAGE SYSTEM (MAX 5 FIELDS PER MODAL)
// ================================================================
function buildStaffAppPage1() {
  const m = new ModalBuilder()
    .setCustomId("staff_app_page1")
    .setTitle("Staff Application — Page 1");

  m.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("region_age")
        .setLabel("Region, IGN, Age, Timezone") // OK
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("discover_like")
        .setLabel("When did you find us? ") // FIXED <45
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("experience")
        .setLabel("Previous staff experience?") // OK
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("strengths_weaknesses")
        .setLabel("Strengths & weaknesses") // FIXED <45
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("activity")
        .setLabel("Daily activity (hours)?") // OK
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  return m;
}

function buildStaffAppPage2() {
  const m = new ModalBuilder()
    .setCustomId("staff_app_page2")
    .setTitle("Staff Application — Page 2");

  m.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("moderation_capable")
        .setLabel("Can you moderate maturely? How?") // FIXED
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("skills")
        .setLabel("Skills you bring to staff") // FIXED
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("why_apply")
        .setLabel("Why apply for staff?") // FIXED
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("extra")
        .setLabel("Anything else? (N/A if none)") // FIXED
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );

  return m;
}


// START STAFF APPLICATION
async function startStaffApplication(interaction) {
  DATA.staffPanels[interaction.user.id] = interaction.channelId; // save panel source
  saveData();
  return interaction.showModal(buildStaffAppPage1());
}

// HANDLE STAFF APP PAGES
async function handleStaffAppPages(interaction) {
  const uid = interaction.user.id;
  const panelChannelId = DATA.staffPanels[uid];

  const cfg = TICKET_PANEL_CONFIG[String(panelChannelId)];
  if (!cfg || !cfg.applicationChannelId) {
    return interaction.reply({
      content: "Application channel is not configured.",
      ephemeral: true
    });
  }

  const appChannel = interaction.guild.channels.cache.get(cfg.applicationChannelId);
  if (!appChannel || appChannel.type !== 0) {
    return interaction.reply({
      content: "Application channel missing or invalid.",
      ephemeral: true
    });
  }

  // PAGE 1 -> store partial & go to page 2
  if (interaction.customId === "staff_app_page1") {
    DATA.partialStaffApps[uid] = {
      region_age: clean(interaction.fields.getTextInputValue("region_age")),
      discover_like: clean(interaction.fields.getTextInputValue("discover_like")),
      experience: clean(interaction.fields.getTextInputValue("experience")),
      strengths_weaknesses: clean(
        interaction.fields.getTextInputValue("strengths_weaknesses")
      ),
      activity: clean(interaction.fields.getTextInputValue("activity"))
    };
    saveData();
    return interaction.showModal(buildStaffAppPage2());
  }

  // PAGE 2 -> final submit
  if (interaction.customId === "staff_app_page2") {
    const d = DATA.partialStaffApps[uid] || {};
    d.moderation_capable = clean(
      interaction.fields.getTextInputValue("moderation_capable")
    );
    d.skills = clean(interaction.fields.getTextInputValue("skills"));
    d.why_apply = clean(interaction.fields.getTextInputValue("why_apply"));
    d.extra = clean(interaction.fields.getTextInputValue("extra"));

    const member = interaction.guild.members.cache.get(uid);
    const joinedDays =
      member && member.joinedTimestamp
        ? Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24))
        : "Unknown";

    const embed = new EmbedBuilder()
      .setTitle(`🛡 Staff Application — ${interaction.user.tag}`)
      .setColor(0x00b894)
      .addFields(
        { name: "Region / IGN / Age / Timezone", value: d.region_age || "N/A" },
        { name: "Discovery & Likes", value: d.discover_like || "N/A" },
        { name: "Previous Staff Experience", value: d.experience || "N/A" },
        { name: "Strengths & Weaknesses", value: d.strengths_weaknesses || "N/A" },
        { name: "Activity per Day", value: d.activity || "N/A" },
        { name: "Moderation Capability", value: d.moderation_capable || "N/A" },
        { name: "Skills Brought to Team", value: d.skills || "N/A" },
        { name: "Why Apply for Staff?", value: d.why_apply || "N/A" },
        { name: "Anything Else", value: d.extra || "N/A" },
        { name: "Applicant", value: `${interaction.user}`, inline: true },
        { name: "User ID", value: interaction.user.id, inline: true },
        { name: "Joined Guild", value: `${joinedDays} days ago` }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`staff_app_decide_accept:${uid}`)
        .setLabel("✅ Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`staff_app_decide_deny:${uid}`)
        .setLabel("❌ Deny")
        .setStyle(ButtonStyle.Danger)
    );

    await appChannel.send({ embeds: [embed], components: [row] });

    delete DATA.partialStaffApps[uid];
    delete DATA.staffPanels[uid];
    saveData();

    return interaction.reply({
      content: "Your staff application has been submitted!",
      ephemeral: true
    });
  }
}

// ================================================================
// STAFF APPLICATION — DECISION FLOW
// ================================================================
async function handleStaffAppDecisionButton(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
    return interaction.reply({ content: "You don't have permission.", ephemeral: true });

  const [_, raw] = interaction.customId.split("staff_app_decide_");
  const [action, targetId] = raw.split(":");

  const modal = new ModalBuilder()
    .setCustomId(`staff_app_modal_decide:${action}:${targetId}:${interaction.message.id}`)
    .setTitle(action === "accept" ? "Accept Reason" : "Deny Reason");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("staff_app_decide_reason")
        .setLabel("Reason (sent to applicant via DM)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    )
  );

  return interaction.showModal(modal);
}

async function handleStaffAppDecisionModal(interaction) {
  const [_, action, targetId, messageId] = interaction.customId.split(":");

  const reason =
    interaction.fields.getTextInputValue("staff_app_decide_reason") ||
    "No reason provided.";

  try {
    const user = await client.users.fetch(targetId);
    await user.send(
      action === "accept"
        ? `🎉 You have been **ACCEPTED** as staff!\nReason: ${reason}`
        : `❌ Your staff application was **DENIED**.\nReason: ${reason}`
    );
  } catch (e) {
    console.log("DM error:", e.message);
  }

  try {
    const msg = await interaction.channel.messages.fetch(messageId);
    const old = msg.embeds[0];
    const e = EmbedBuilder.from(old);

    e.addFields({
      name: "Status",
      value:
        action === "accept"
          ? `✅ Accepted by ${interaction.user}\nReason: ${reason}`
          : `❌ Denied by ${interaction.user}\nReason: ${reason}`
    });

    await msg.edit({
      embeds: [e],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Accepted")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setLabel("Denied")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        )
      ]
    });
  } catch (e) {
    console.log("Staff decision edit error:", e.message);
  }

  return interaction.reply({
    content: action === "accept" ? "Marked as accepted!" : "Marked as denied!",
    ephemeral: true
  });
}

// ================================================================
// READY EVENT FOR TICKET SYSTEM
// ================================================================
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

// ================================================================
// INTERACTION HANDLER — BUTTONS + MODALS (TICKETS + STAFF APPS)
// ================================================================
client.on("interactionCreate", async (interaction) => {
  try {
    // ===================== BUTTONS =====================
    if (interaction.isButton()) {
      const id = interaction.customId;

      // SUPPORT TICKET BUTTON
      if (id === "ticket_support_open") {
        return interaction.showModal(buildSupportTicketModal());
      }

      // PARTNERSHIP TICKET BUTTON
      if (id === "ticket_partner_open") {
        return interaction.showModal(buildPartnerTicketModal());
      }

      // STAFF APPLICATION BUTTON
if (id === "ticket_staff_apply") {
    // FIXED: Detect panel using message.channelId (the panel’s channel)
    const panelId = String(interaction.message?.channelId || interaction.channelId);
    const cfg = TICKET_PANEL_CONFIG[panelId];

    console.log("STAFF APPLY → PANEL:", panelId, "CFG:", cfg);

    if (!cfg || cfg.type !== "multi") {
      return interaction.reply({
        content: "Staff applications are not available here.",
        ephemeral: true
      });
    }

    return startStaffApplication(interaction);
}


      // STAFF APPLICATION DECISION BUTTONS
      if (id.startsWith("staff_app_decide_")) {
        return handleStaffAppDecisionButton(interaction);
      }

      // CLOSE TICKET BUTTON → OPEN CLOSE MODAL
      if (id === "ticket_close") {
        return interaction.showModal(buildCloseTicketModal());
      }
    }

    // ===================== MODALS =====================
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // SUPPORT TICKET MODAL SUBMIT
      if (id === "support_ticket_modal") {
        const name = clean(interaction.fields.getTextInputValue("support_name"));
        const issue = clean(interaction.fields.getTextInputValue("support_issue"));
        return createTicketChannel(interaction, "support", { name, issue });
      }

      // PARTNERSHIP TICKET MODAL SUBMIT
      if (id === "partner_ticket_modal") {
        const name = clean(interaction.fields.getTextInputValue("partner_name"));
        const discord = clean(interaction.fields.getTextInputValue("partner_discord"));
        const link = clean(interaction.fields.getTextInputValue("partner_link"));
        const details = clean(interaction.fields.getTextInputValue("partner_details"));

        return createTicketChannel(interaction, "partner", {
          name,
          discord,
          link,
          details
        });
      }

      // STAFF APPLICATION PAGES
      if (id === "staff_app_page1" || id === "staff_app_page2") {
        return handleStaffAppPages(interaction);
      }

      // STAFF APPLICATION DECISION MODAL
      if (id.startsWith("staff_app_modal_decide:")) {
        return handleStaffAppDecisionModal(interaction);
      }

      // TICKET CLOSE MODAL
      if (id === "ticket_close_modal") {
        return handleTicketCloseModal(interaction);
      }
    }
  } catch (e) {
    console.log("Interaction error:", e.message);
  }
});

// ================================================================
// MESSAGE ACTIVITY TRACKER
// ================================================================
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












