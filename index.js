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

// USE CHANNEL ID
const TEAMS_CHANNEL = "1389976721704489010";

// BIG ASS TEXT MAKER
function big(text) {
  return `**__${text.toUpperCase()}__**`; // SUPER BOLD + UNDERLINE + HUGE FEEL
}

// READY
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const teamChan = guild.channels.cache.get(TEAMS_CHANNEL);
  if (!teamChan) return console.log("❌ Teams channel not found");

  // DELETE old bot messages
  const msgs = await teamChan.messages.fetch();
  msgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete());

  // MAIN PANEL
  const embed = new EmbedBuilder()
    .setTitle("🟨 **TEAM REGISTRATION PANEL**")
    .setDescription("Choose an option below:")
    .setColor(0xFFD700);

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

// INTERACTIONS HANDLER
client.on("interactionCreate", async (interaction) => {

  // BUTTON 1 — REGISTER TEAM
  if (interaction.isButton() && interaction.customId === "register_team") {
    
    const modal = new ModalBuilder()
      .setCustomId("team_modal")
      .setTitle("Register Your Team");

    const teamName = new TextInputBuilder()
      .setCustomId("team_name")
      .setLabel("📝 Team Name ")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const m1 = new TextInputBuilder()
      .setCustomId("m1")
      .setLabel("⭐ Member 1 ")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const m2 = new TextInputBuilder()
      .setCustomId("m2")
      .setLabel("Member 2 ")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const m3 = new TextInputBuilder()
      .setCustomId("m3")
      .setLabel("Member 3 ")
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

  // BUTTON 2 — NEED TEAM
  if (interaction.isButton() && interaction.customId === "need_team") {
    const guild = interaction.guild;
    const teamChan = guild.channels.cache.get(TEAMS_CHANNEL);

    await teamChan.send(`🔔 **${interaction.user} is teamless!Poor Guy Someone invite him to a team!**`);
    
    return interaction.reply({ content: "📣 Announced!", ephemeral: true });
  }

  // TEAM MODAL SUBMIT
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

    await interaction.reply({
      content: "✅ Team Posted!",
      ephemeral: true
    });
  }
});

client.login(process.env.TOKEN);
