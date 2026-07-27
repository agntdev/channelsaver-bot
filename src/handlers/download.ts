import { Composer } from "grammy";
import type { Ctx, PendingVideo } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "⬇️ Download video", data: "download:reply", order: 10 });

const composer = new Composer<Ctx>();

function videoFromMessage(message: { message_id: number; chat: { id: number; username?: string }; video?: any }): PendingVideo | undefined {
  const video = message.video;
  if (!video?.file_id) return undefined;
  return {
    chatId: message.chat.id,
    messageId: message.message_id,
    fileId: video.file_id,
    fileName: video.file_name,
    mimeType: video.mime_type,
    duration: video.duration,
    width: video.width,
    height: video.height,
    supportsStreaming: video.supports_streaming,
    isPublic: Boolean(message.chat.username),
  };
}

/** Offer a quick action after a video reaches the bot. */
composer.on("message:video", async (ctx) => {
  const candidate = videoFromMessage(ctx.message);
  if (!candidate) return;
  ctx.session.pendingVideo = candidate;
  await ctx.reply("This video is ready to download.", {
    reply_markup: inlineKeyboard([[inlineButton("⬇️ Download", "download:reply")]]),
  });
});

composer.command("download", async (ctx) => {
  const message = ctx.message;
  const candidate = message?.reply_to_message
    ? videoFromMessage(message.reply_to_message)
    : undefined;
  if (!candidate) {
    await ctx.reply("Reply to a video, then use /download.");
    return;
  }
  ctx.session.pendingVideo = candidate;
  await ctx.reply("This video is ready. Tap Download to continue.", {
    reply_markup: inlineKeyboard([[inlineButton("⬇️ Download", "download:reply")]]),
  });
});

export default composer;
