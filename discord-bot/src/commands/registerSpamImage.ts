import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { downloadImage, isProcessableImageAttachment } from '../services/imageDownloader.js';
import { AiClient } from '../services/aiClient.js';

const ai = new AiClient();
export const registerSpamImageCommand = {
  data: new SlashCommandBuilder().setName('register-spam-image').setDescription('添付画像を既知スパム画像として登録します').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addAttachmentOption((option) => option.setName('image').setDescription('登録する画像').setRequired(true))
    .addStringOption((option) => option.setName('category').setDescription('カテゴリ').setRequired(false))
    .addStringOption((option) => option.setName('notes').setDescription('備考').setRequired(false)),
  async execute(interaction: ChatInputCommandInteraction) {
    const attachment = interaction.options.getAttachment('image', true);
    if (!isProcessableImageAttachment(attachment)) {
      await interaction.reply({ content: '対応していない画像、またはサイズ上限超過です。', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const image = await downloadImage(attachment);
    const result = await ai.registerSpamImage(image.buffer, image.filename, { guild_id: interaction.guildId ?? '', registered_by_user_id: interaction.user.id, category: interaction.options.getString('category') ?? '', notes: interaction.options.getString('notes') ?? '' });
    await interaction.editReply(`登録しました: ${JSON.stringify(result)}`);
  }
};
