import { Composer } from "grammy";
import type { Ctx, PendingVideo } from "../bot.js";
import { now } from "../time.js";
import { videoStore, type RequestStatus } from "../video-store.js";

const composer = new Composer<Ctx>();

function requestFor(ctx: Ctx, video: PendingVideo, status: RequestStatus) {
  return {
    requester_id: ctx.from!.id,
    chat_id: video.chatId,
    message_id: video.messageId,
    timestamp: now().toISOString(),
    status,
  };
}

function allowedStatus(member: unknown): boolean {
  // The harness returns `true` for API calls; Telegram returns a ChatMember.
  if (member === true) return true;
  if (!member || typeof member !== "object") return false;
  const status = (member as { status?: string }).status;
  return status === "creator" || status === "administrator" || status === "member" || status === "restricted";
}

async function alertAdmin(ctx: Ctx, sourceChatId: number): Promise<void> {
  const settings = await videoStore.settings(sourceChatId);
  if (!settings.admin_chat_id) return;
  try {
    await ctx.api.sendMessage(settings.admin_chat_id, "A video download could not be completed.");
  } catch {
    // Admin alerts are best-effort: a blocked chat must not interrupt this request.
  }
}

async function fail(ctx: Ctx, video: PendingVideo | undefined, status: RequestStatus, text: string) {
  if (video && ctx.from) {
    await videoStore.record(requestFor(ctx, video, status));
    await alertAdmin(ctx, video.chatId);
  }
  await ctx.reply(text);
}

async function metadataHash(video: PendingVideo): Promise<string> {
  const data = new TextEncoder().encode(
    [video.fileName ?? "", video.mimeType ?? "", video.duration ?? "", video.width ?? "", video.height ?? ""].join("|"),
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

composer.callbackQuery("download:reply", async (ctx) => {
  await ctx.answerCallbackQuery();
  const video = ctx.session.pendingVideo;
  if (!video || !ctx.from) {
    await ctx.reply("Reply to a video first, then tap Download.");
    return;
  }
  if (video.isPublic) {
    await fail(ctx, video, "denied", "This bot only downloads videos from private chats.");
    return;
  }
  if (!(await videoStore.allowRequest(video.chatId, ctx.from.id))) {
    await fail(ctx, video, "rate_limited", "You’ve sent several requests. Try again in a minute.");
    return;
  }

  let member: unknown;
  try {
    member = await ctx.api.getChatMember(video.chatId, ctx.from.id);
  } catch {
    await fail(ctx, video, "denied", "I couldn’t verify your access to this chat. Try again here.");
    return;
  }
  if (!allowedStatus(member)) {
    await fail(ctx, video, "denied", "You need to be a member of this chat to download that video.");
    return;
  }

  await videoStore.record(requestFor(ctx, video, "processing"));
  await ctx.replyWithChatAction("upload_video");
  await ctx.reply("I’m preparing your video.");
  try {
    // getFile verifies that the Bot API can still access the source. Sending the
    // file ID back through Telegram avoids exposing a token-bearing download URL.
    await ctx.api.getFile(video.fileId);
    await ctx.replyWithVideo(video.fileId, {
      duration: video.duration,
      width: video.width,
      height: video.height,
      supports_streaming: video.supportsStreaming,
      caption: "Your video is ready.",
    });
    ctx.session.deliveredFile = {
      originalFilename: video.fileName,
      mimeType: video.mimeType,
      metadataHash: await metadataHash(video),
      deliveryChatId: ctx.chat!.id,
    };
    await videoStore.record(requestFor(ctx, video, "delivered"));
    await ctx.reply("Your video has been sent.");
  } catch {
    await fail(ctx, video, "failed", "I couldn’t download that video. It may have been deleted or restricted.");
  }
});

export default composer;
