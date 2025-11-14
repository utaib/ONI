const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// CHANNEL NAME + FALLBACK IDS
const TEAMS_CHANNEL_NAME = "🫂┃teams";
const FALLBACK_CHANNEL_IDS = [
  "1389976721704489010", // server #1
  "1425816192693571637"  // server #2
];

// BIG TEXT MAKER
function big(text) {
  return `**__${text.toUpperCase()}__**`;
}

// Find channel by name OR fallback IDs
function getTeamChannel(guild) {
  return (
    guild.channels.cache.find(c => c.name === TEAMS_CHANNEL_NAME) ||
    guild.channels.cache.get(FALLBACK_CHANNEL_IDS[0]) ||
    guild.channels.cache.get(FALLBACK_CHANNEL_IDS[1])
  );
}

// READY
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.guilds.cache.forEach(async (guild) => {
    const teamChan = getTeamChannel(guild);
    if (!teamChan) return console.log(`❌ Teams channel not found in ${guild.name}`);

    // CLEAN OLD BOT MESSAGES
    const msgs = await teamChan.messages.fetch();
    msgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete());

    // PANEL
    const embed = new EmbedBuilder()
      .setTitle("🟨 **TEAM REGISTRATION PANEL**")
      .setColor(0xFFD700)
      .setDescription(
        "Choose an option below.\n\n" +
        "**⚠️ Pinging Teammates:**\n" +
        "Inside the form, type their name like `@username` so Discord pings them."
      );

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
  });
});


// INTERACTION HANDLER
client.on("interactionCreate", async (interaction) => {
  const guild = interaction.guild;
  const teamChan = getTeamChannel(guild);
  if (!teamChan) return interaction.reply({ content: "⚠️ Teams channel not found.", ephemeral: true });

  // BUTTON 1: REGISTER TEAM
  if (interaction.isButton() && interaction.customId === "register_team") {
    const modal = new ModalBuilder()
      .setCustomId("team_modal")
      .setTitle("Register Your Team");

    const teamName = new TextInputBuilder()
      .setCustomId("team_name")
      .setLabel("📝 Team Name (Required)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const m1 = new TextInputBuilder()
      .setCustomId("m1")
      .setLabel("⭐ Member 1")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const m2 = new TextInputBuilder()
      .setCustomId("m2")
      .setLabel("Member 2 (Optional)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const m3 = new TextInputBuilder()
      .setCustomId("m3")
      .setLabel("Member 3 (Optional)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const m45 = new TextInputBuilder()
      .setCustomId("m45")
      .setLabel("Members 4 & 5 (comma separated)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(teamName),
      new ActionRowBuilder().addComponents(m1),
      new ActionRowBuilder().addComponents(m2),
      new ActionRowBuilder().addComponents(m3),
      new ActionRowBuilder().addComponents(m45)
    );

    return interaction.showModal(modal);
  }


  // BUTTON 2: LOOKING FOR A TEAM
  if (interaction.isButton() && interaction.customId === "need_team") {

    const modal = new ModalBuilder()
      .setCustomId("lf_modal")
      .setTitle("Looking For a Team");

    const about = new TextInputBuilder()
      .setCustomId("about")
      .setLabel("What are your cool things / about you?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const hours = new TextInputBuilder()
      .setCustomId("hours")
      .setLabel("How long will you be online?")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const timezone = new TextInputBuilder()
      .setCustomId("timezone")
      .setLabel("Your Timezone (Ex: IST, EST)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(about),
      new ActionRowBuilder().addComponents(hours),
      new ActionRowBuilder().addComponents(timezone)
    );

    return interaction.showModal(modal);
  }


  // TEAM REGISTRATION SUBMISSION
  if (interaction.isModalSubmit() && interaction.customId === "team_modal") {

    const name = interaction.fields.getTextInputValue("team_name");
    const m1 = interaction.fields.getTextInputValue("m1");
    const m2 = interaction.fields.getTextInputValue("m2") || "—";
    const m3 = interaction.fields.getTextInputValue("m3") || "—";

    const raw45 = interaction.fields.getTextInputValue("m45") || "";
    let m4 = "—";
    let m5 = "—";

    if (raw45.includes(",")) {
      const parts = raw45.split(",").map(s => s.trim());
      m4 = parts[0] || "—";
      m5 = parts[1] || "—";
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

    await teamChan.send({ embeds: [embed] });

    return interaction.reply({
      content: "✅ Team Posted!\n<@1094566631281270814> is the goat fr 🔥",
      ephemeral: true
    });
  }


  // LOOKING FOR TEAM SUBMISSION
  if (interaction.isModalSubmit() && interaction.customId === "lf_modal") {

    const about = interaction.fields.getTextInputValue("about");
    const hours = interaction.fields.getTextInputValue("hours");
    const timezone = interaction.fields.getTextInputValue("timezone");

    const embed = new EmbedBuilder()
      .setTitle("🔍 **LOOKING FOR A TEAM**")
      .setColor(0x3498db)
      .setDescription(
        `${interaction.user} is looking for a team! Poor guy, someone invite him!\n\n` +
        `**About Him:** ${about}\n\n` +
        `**Online Time:** ${hours}\n` +
        `**Timezone:** ${timezone}`
      )
      .setTimestamp();

    await teamChan.send({ embeds: [embed] });

    return interaction.reply({
      content: "📣 Your request has been posted!",
      ephemeral: true
    });
  }
});

client.login(process.env.TOKEN);
