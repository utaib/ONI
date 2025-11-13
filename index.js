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

// USE CHANNEL ID ONLY
const TEAMS_CHANNEL = "1389976721704489010";

// Function: Make text BIG
const bigText = (str) => {
  return str
    .toUpperCase()
    .replace(/[A-Z]/g, (c) =>
      String.fromCodePoint(c.charCodeAt(0) + 119743)
    );
};

// BOT READY
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const teamChan = guild.channels.cache.get(TEAMS_CHANNEL);
  if (!teamChan) return console.log("❌ Teams channel not found");

  // Delete old messages
  const msgs = await teamChan.messages.fetch();
  msgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete());

  // Button Embed
  const embed = new EmbedBuilder()
    .setTitle("🏆 **TEAM REGISTRATION**")
    .setDescription("Click the button below to register your team!")
    .setColor(0xFFD700);

  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("register_team")
      .setLabel("➕ Register Your Team")
      .setStyle(ButtonStyle.Primary)
  );

  await teamChan.send({ embeds: [embed], components: [button] });
});

// BUTTON + MODAL HANDLER
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId === "register_team") {
    const modal = new ModalBuilder()
      .setCustomId("team_modal")
      .setTitle("Register Your Team");

    const teamName = new TextInputBuilder()
      .setCustomId("team_name")
      .setLabel("📝 Team Name (Required)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const member1 = new TextInputBuilder()
      .setCustomId("m1")
      .setLabel("⭐ Member 1 ")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const member2 = new TextInputBuilder()
      .setCustomId("m2")
      .setLabel("Member 2 ")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const member3 = new TextInputBuilder()
      .setCustomId("m3")
      .setLabel("Member 3 ")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const member45 = new TextInputBuilder()
      .setCustomId("m45")
      .setLabel("Members 4 & 5 (comma separated)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(teamName),
      new ActionRowBuilder().addComponents(member1),
      new ActionRowBuilder().addComponents(member2),
      new ActionRowBuilder().addComponents(member3),
      new ActionRowBuilder().addComponents(member45)
    );

    return interaction.showModal(modal);
  }

  // MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === "team_modal") {
    const guild = interaction.guild;
    const teamChan = guild.channels.cache.get(TEAMS_CHANNEL);

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
    } else if (raw45.trim() !== "") {
      m4 = raw45.trim();
    }

    // FINAL PRETTY EMBED
    const embed = new EmbedBuilder()
      .setTitle(`🏆 **${bigText(name)}**`)
      .setColor(0xFFD700)
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

    await interaction.reply({
      content: "✅ Your team has been posted!",
      ephemeral: true
    });
  }
});

client.login(process.env.TOKEN);
