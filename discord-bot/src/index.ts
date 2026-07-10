import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { messageCreate } from './events/messageCreate.js';
import { registerSpamImageCommand } from './commands/registerSpamImage.js';
import { configureLogChannelCommand } from './commands/configureLogChannel.js';
import { handleReviewButton } from './interactions/reviewButtons.js';
import './repositories/database.js';

if (!config.discordToken) throw new Error('DISCORD_TOKEN is required');
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
if (config.messageContentIntent) intents.push(GatewayIntentBits.MessageContent);
const client = new Client({ intents });
const commands = new Collection<string, typeof registerSpamImageCommand | typeof configureLogChannelCommand>();
commands.set(registerSpamImageCommand.data.name, registerSpamImageCommand);
commands.set(configureLogChannelCommand.data.name, configureLogChannelCommand);
client.once(Events.ClientReady, (readyClient) => logger.info({ user: readyClient.user.tag }, 'bot ready'));
client.on(Events.MessageCreate, (message) => messageCreate.execute(message));
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() && await handleReviewButton(interaction)) return;
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
    else await interaction.reply({ content: 'このコマンドは現在の Bot プロセスに登録されていません。Bot を再起動し、スラッシュコマンドを再デプロイしてください。', flags: MessageFlags.Ephemeral });
  } catch (error) {
    logger.error({ error }, 'interaction failed');
    if (interaction.isRepliable()) {
      const content = '処理中にエラーが発生しました。';
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => undefined);
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
});
client.login(config.discordToken);
