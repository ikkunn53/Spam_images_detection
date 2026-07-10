import { ButtonInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { DetectionRepository } from '../repositories/detectionRepository.js';

const detections = new DetectionRepository();
const actionMap: Record<string, string> = { confirm: 'spam_confirmed', false_positive: 'false_positive', register: 'register_spam_image', add_group: 'add_to_similar_group' };

export const handleReviewButton = async (interaction: ButtonInteraction): Promise<boolean> => {
  if (!interaction.customId.startsWith('review:')) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'この操作には Manage Messages 権限が必要です。', flags: MessageFlags.Ephemeral });
    return true;
  }
  const [, rawAction, rawId] = interaction.customId.split(':');
  const action = actionMap[rawAction];
  const detectionEventId = Number(rawId);
  if (!action || !Number.isInteger(detectionEventId)) {
    await interaction.reply({ content: '不正なレビュー操作です。', flags: MessageFlags.Ephemeral });
    return true;
  }
  detections.addModerationAction(detectionEventId, action, interaction.user.id);
  await interaction.reply({ content: `監査ログへ記録しました: ${action}`, flags: MessageFlags.Ephemeral });
  return true;
};
