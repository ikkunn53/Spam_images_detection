import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { messageCreate } from './events/messageCreate.js';
import { registerSpamImageCommand } from './commands/registerSpamImage.js';
import { configureLogChannelCommand } from './commands/configureLogChannel.js';
import { pingCommand } from './commands/ping.js';
import { registerSpamMessageCommand } from './commands/registerSpamMessage.js';
import { handleReviewButton } from './interactions/reviewButtons.js';
import { startWebAdmin } from './webAdmin.js';
import { importLocalSpamImages } from './services/localSpamImageImporter.js';
import './repositories/database.js';

if (!config.discordToken) throw new Error('DISCORD_TOKEN is required');
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
if (config.messageContentIntent) intents.push(GatewayIntentBits.MessageContent);
else logger.warn('MESSAGE_CONTENT_INTENT=false のため、Discord から添付画像情報を受け取れず画像スパム検知は動作しません。');
const client = new Client({ intents });
const commands = new Collection<string, typeof registerSpamImageCommand | typeof registerSpamMessageCommand | typeof configureLogChannelCommand | typeof pingCommand>();
commands.set(registerSpamImageCommand.data.name, registerSpamImageCommand);
commands.set(registerSpamMessageCommand.data.name, registerSpamMessageCommand);
commands.set(configureLogChannelCommand.data.name, configureLogChannelCommand);
commands.set(pingCommand.data.name, pingCommand);
client.once(Events.ClientReady, (readyClient) => {
  logger.info({ user: readyClient.user.tag }, 'bot ready');
  startWebAdmin(client);
  void importLocalSpamImages(readyClient.user.id);
});
client.on(Events.MessageCreate, (message) => messageCreate.execute(message));
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() && await handleReviewButton(interaction)) return;
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command === registerSpamImageCommand || command === configureLogChannelCommand || command === pingCommand) await command.execute(interaction);
      else await interaction.reply({ content: 'このコマンドは現在の Bot プロセスに登録されていません。Bot を再起動し、スラッシュコマンドを再デプロイしてください。', flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.isMessageContextMenuCommand()) {
      if (interaction.commandName === registerSpamMessageCommand.data.name) await registerSpamMessageCommand.execute(interaction);
      else await interaction.reply({ content: 'このコマンドは現在の Bot プロセスに登録されていません。Bot を再起動し、アプリコマンドを再デプロイしてください。', flags: MessageFlags.Ephemeral });
    }
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
