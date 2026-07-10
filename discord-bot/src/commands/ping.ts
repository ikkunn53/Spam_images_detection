import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { request } from 'undici';
import { config } from '../config/env.js';
import { GuildSettingsRepository } from '../repositories/guildSettingsRepository.js';

const guildSettings = new GuildSettingsRepository();

const checkAiService = async (): Promise<string> => {
  try {
    const response = await request(`${config.aiServiceUrl}/health`, {
      method: 'GET',
      bodyTimeout: config.aiHeadersTimeoutMs,
      headersTimeout: config.aiHeadersTimeoutMs
    });
    return response.statusCode >= 200 && response.statusCode < 300 ? `OK (${response.statusCode})` : `NG (${response.statusCode})`;
  } catch (error) {
    return `NG (${error instanceof Error ? error.message : 'unknown error'})`;
  }
};

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Bot と AI Service の稼働状態を確認します'),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const aiStatus = await checkAiService();
    const settings = interaction.guildId ? guildSettings.get(interaction.guildId) : null;
    const logChannel = settings?.log_channel_id ? `<#${settings.log_channel_id}>` : '未設定';
    const wsPing = interaction.client.ws.ping >= 0 ? `${interaction.client.ws.ping}ms` : '計測中';

    await interaction.editReply([
      'pong',
      `Bot WS: ${wsPing}`,
      `AI Service: ${aiStatus}`,
      `Message Content Intent: ${config.messageContentIntent ? '有効' : '無効（画像添付を検知できません）'}`,
      `検知ログチャンネル: ${logChannel}`
    ].join('\n'));
  }
};
