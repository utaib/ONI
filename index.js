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

// 🪄 Channels 
const TEAMS_CHANNEL = "🫂┃teams";

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const teamChan = guild.channels.cache.find(c => c.name === TEAMS_CHANNEL);
  if (!teamChan) return console.log("Teams channel not found");

  // Clean old bot messages
  const msgs = await teamChan.messages.fetch();
  msgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete());

  // Post Register Team button
  const embed = new EmbedBuilder()
    .setTitle("🏆 Team Registration")
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

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId === "register_team") {
    const modal = new ModalBuilder()
      .setCustomId("team_modal")
      .setTitle("Register Your Team");

    const teamName = new TextInputBuilder()
      .setCustomId("team_name")
      .setLabel("Team Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const member1 = new TextInputBuilder().setCustomId("m1").setLabel("Member 1").setStyle(TextInputStyle.Short).setRequired(true);
    const member2 = new TextInputBuilder().setCustomCustomId("m2").setLabel("Member 2").setStyle(TextInputStyle.Short).setRequired(true);
    const member3 = new TextInputBuilder().setCustomId("m3").setLabel("Member 3").setStyle(TextInputStyle.Short).setRequired(true);
    const member4 = new TextInputBuilder().setCustomId("m4").setLabel("Member 4").setStyle(TextInputStyle.Short).setRequired(true);
    const member5 = new TextInputBuilder().setCustomId("m5").setLabel("Member 5").setStyle(TextInputStyle.Short).setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(teamName),
      new ActionRowBuilder().addComponents(member1),
      new ActionRowBuilder().addComponents(member2),
      new ActionRowBuilder().addComponents(member3),
      new ActionRowBuilder().addComponents(member4),
      new ActionRowBuilder().addComponents(member5)
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "team_modal") {
    const teamName = interaction.fields.getTextInputValue("team_name");
    const m1 = interaction.fields.getTextInputValue("m1");
    const m2 = interaction.fields.getTextInputValue("m2");
    const m3 = interaction.fields.getTextInputValue("m3");
    const m4 = interaction.fields.getTextInputValue("m4");
    const m5 = interaction.fields.getTextInputValue("m5");

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Team: ${teamName}`)
      .setColor(0x00AE86)
      .setDescription(
        `**Member 1:** ${m1}\n` +
        `**Member 2:** ${m2}\n` +
        `**Member 3:** ${m3}\n` +
        `**Member 4:** ${m4}\n` +
        `**Member 5:** ${m5}`
      )
      .setFooter({ text: `Created by ${interaction.user.username}` });

    const guild = interaction.guild;
    const teamChan = guild.channels.cache.find(c => c.name === TEAMS_CHANNEL);
    await teamChan.send({ embeds: [embed] });

    await interaction.reply({ content: "✅ Your team has been posted!", ephemeral: true });
  }
});

// LOGIN
client.login(process.env.TOKEN);





