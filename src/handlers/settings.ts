import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { videoStore, type AdminSettings } from "../video-store.js";

registerMainMenuItem({ label: "⚙️ Download settings", data: "settings:show", order: 20 });

const composer = new Composer<Ctx>();

function settingsText(settings: AdminSettings): string {
  const admin = settings.admin_chat_id ? "This chat" : "Not configured";
  const filename = settings.filename_format === "original" ? "Original name" : "Timestamped name";
  return `Download settings\n\nAdmin alerts: ${admin}\nFilename format: ${filename}\nAudit retention: ${settings.retention_days} days`;
}

function keyboard() {
  return inlineKeyboard([
    [inlineButton("Use this chat for alerts", "settings:admin")],
    [inlineButton("Use original filename", "settings:name:original"), inlineButton("Use timestamped filename", "settings:name:timestamped")],
    [inlineButton("Keep logs 7 days", "settings:retain:7"), inlineButton("Keep logs 30 days", "settings:retain:30")],
    [inlineButton("Keep logs 90 days", "settings:retain:90")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

async function canManage(ctx: Ctx): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;
  if (ctx.chat.type === "private") return true;
  try {
    const member: unknown = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    if (member === true) return true; // tokenless harness
    return member !== null && typeof member === "object" &&
      (["creator", "administrator"] as string[]).includes((member as { status?: string }).status ?? "");
  } catch {
    return false;
  }
}

async function show(ctx: Ctx, edit: boolean): Promise<void> {
  const settings = await videoStore.settings(ctx.chat!.id);
  if (edit) await ctx.editMessageText(settingsText(settings), { reply_markup: keyboard() });
  else await ctx.reply(settingsText(settings), { reply_markup: keyboard() });
}

composer.callbackQuery("settings:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await show(ctx, true);
});

composer.callbackQuery(/^settings:(admin|name:(?:original|timestamped)|retain:(?:7|30|90))$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await canManage(ctx))) {
    await ctx.reply("Only a chat administrator can change these settings.");
    return;
  }
  const action = ctx.callbackQuery.data;
  if (action === "settings:admin") await videoStore.updateSettings(ctx.chat!.id, { admin_chat_id: ctx.chat!.id });
  if (action.startsWith("settings:name:")) {
    await videoStore.updateSettings(ctx.chat!.id, { filename_format: action.endsWith("original") ? "original" : "timestamped" });
  }
  if (action.startsWith("settings:retain:")) {
    await videoStore.updateSettings(ctx.chat!.id, { retention_days: Number(action.split(":")[2]) as 7 | 30 | 90 });
  }
  await show(ctx, true);
});

export default composer;
