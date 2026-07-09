import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { messageCreate } from './events/messageCreate.js';
import { registerSpamImageCommand } from './commands/registerSpamImage.js';
import { handleReviewButton } from './interactions/reviewButtons.js';
import './repositories/database.js';

if (!config.discordToken) throw new Error('DISCORD_TOKEN is required');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const commands = new Collection<string, typeof registerSpamImageCommand>();
commands.set(registerSpamImageCommand.data.name, registerSpamImageCommand);
client.once(Events.ClientReady, (readyClient) => logger.info({ user: readyClient.user.tag }, 'bot ready'));
client.on(Events.MessageCreate, (message) => messageCreate.execute(message));
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() && await handleReviewButton(interaction)) return;
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
  } catch (error) {
    logger.error({ error }, 'interaction failed');
    if (interaction.isRepliable()) await interaction.reply({ content: '処理中にエラーが発生しました。', ephemeral: true }).catch(() => undefined);
  }
});
client.login(config.discordToken);
