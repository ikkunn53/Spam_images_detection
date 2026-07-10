import { ChannelType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { GuildSettingsRepository } from '../repositories/guildSettingsRepository.js';

const guildSettings = new GuildSettingsRepository();

const requiredLogChannelPermissions: Array<[bigint, string]> = [
  [PermissionFlagsBits.ViewChannel, 'チャンネルを見る'],
  [PermissionFlagsBits.SendMessages, 'メッセージを送信'],
  [PermissionFlagsBits.EmbedLinks, '埋め込みリンク'],
  [PermissionFlagsBits.AttachFiles, 'ファイルを添付'],
  [PermissionFlagsBits.ReadMessageHistory, 'メッセージ履歴を読む']
];

const missingLogChannelPermissions = (interaction: ChatInputCommandInteraction, channelId: string): string[] | null => {
  const channel = interaction.guild?.channels.cache.get(channelId);
  const botUser = interaction.client.user;
  if (!channel || !botUser || !('permissionsFor' in channel)) return null;
  const permissions = channel.permissionsFor(botUser);
  if (!permissions) return null;
  return requiredLogChannelPermissions.filter(([permission]) => !permissions.has(permission)).map(([, label]) => label);
};

export const configureLogChannelCommand = {
  data: new SlashCommandBuilder()
    .setName('spam-log-channel')
    .setDescription('画像スパム検知ログの送信先チャンネルを設定します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand
      .setName('set')
      .setDescription('検知ログの送信先チャンネルを設定します')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('検知ログを送信するテキストチャンネル')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('clear')
      .setDescription('検知ログの送信先チャンネル設定を解除します'))
    .addSubcommand((subcommand) => subcommand
      .setName('show')
      .setDescription('現在の検知ログ送信先チャンネルを表示します')),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'サーバー内でのみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'set') {
      const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
      const missingPermissions = missingLogChannelPermissions(interaction, channel.id);
      if (missingPermissions === null) {
        await interaction.editReply('Bot のチャンネル権限を確認できなかったため、ログ送信先を設定できませんでした。');
        return;
      }
      if (missingPermissions.length > 0) {
        await interaction.editReply(`Bot に必要な権限が不足しているため、ログ送信先を設定できません。\n不足権限: ${missingPermissions.join(', ')}`);
        return;
      }
      guildSettings.setLogChannel(interaction.guildId, channel.id);
      await interaction.editReply(`画像スパム検知ログの送信先を <#${channel.id}> に設定しました。`);
      return;
    }

    if (subcommand === 'clear') {
      guildSettings.setLogChannel(interaction.guildId, null);
      await interaction.editReply('画像スパム検知ログの送信先設定を解除しました。');
      return;
    }

    const settings = guildSettings.get(interaction.guildId);
    await interaction.editReply(settings.log_channel_id ? `現在の画像スパム検知ログ送信先は <#${settings.log_channel_id}> です。` : '画像スパム検知ログの送信先は未設定です。');
  }
};
