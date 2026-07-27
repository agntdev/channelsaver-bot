import { describe, expect, it } from "vitest";
import { buildBot } from "../src/bot.js";

const botInfo = {
  id: 42, is_bot: true, first_name: "TestBot", username: "test_bot",
  can_join_groups: true, can_read_all_group_messages: false,
  supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false,
};

describe("download membership checks", () => {
  it("does not deliver a video when Telegram reports the requester has left", async () => {
    const bot = await buildBot("test-token");
    bot.botInfo = botInfo;
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    bot.api.config.use(async (_prev, method, payload) => {
      calls.push({ method, payload: (payload ?? {}) as Record<string, unknown> });
      if (method === "getChatMember") return { ok: true, result: { status: "left" } } as any;
      return { ok: true, result: true } as any;
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 2, date: 0,
        chat: { id: 99, type: "private", first_name: "Test" },
        from: { id: 7, is_bot: false, first_name: "Member" },
        video: { file_id: "video", file_unique_id: "unique", width: 1, height: 1, duration: 1 },
      },
    } as any);
    await bot.handleUpdate({
      update_id: 2,
      callback_query: {
        id: "2", data: "download:reply", chat_instance: "test",
        from: { id: 7, is_bot: false, first_name: "Member" },
        message: { message_id: 3, date: 0, chat: { id: 99, type: "private", first_name: "Test" }, from: botInfo, text: "Ready" },
      },
    } as any);

    expect(calls.some((call) => call.method === "sendVideo")).toBe(false);
    expect(calls.some((call) => call.payload.text === "You need to be a member of this chat to download that video.")).toBe(true);
  });
});
