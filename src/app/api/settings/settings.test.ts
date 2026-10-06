import { beforeEach, describe, expect, it } from "vitest";
import { getLLMSettings } from "@/lib/llm";
import { useTestDatabase } from "@/lib/test-db";
import { GET, POST } from "./route";

const post = (llm: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm }),
    }),
  );

beforeEach(() => {
  delete process.env.LLM_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.LLM_PROVIDER;
  useTestDatabase();
});

describe("/api/settings", () => {
  it("reports hasApiKey and never returns the stored key", async () => {
    const saved = await post({ apiKey: "sk-test-secret" });
    expect(saved.status).toBe(200);
    const savedText = await saved.text();
    expect(savedText).not.toContain("sk-test-secret");
    expect(JSON.parse(savedText).llm.hasApiKey).toBe(true);

    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("sk-test-secret");
    const body = JSON.parse(text);
    expect(body.llm.hasApiKey).toBe(true);
    expect(body.llm).not.toHaveProperty("apiKey");
  });

  it("keeps the stored key when a POST sends a blank key", async () => {
    await post({ apiKey: "sk-test-secret" });
    const res = await post({ apiKey: "", model: "llama3.1", apiBase: "http://localhost:11434/v1" });

    expect((await res.json()).llm).toMatchObject({ hasApiKey: true, model: "llama3.1" });
    expect(getLLMSettings().apiKey).toBe("sk-test-secret");
  });

  it("removes the stored key when clearApiKey is true", async () => {
    await post({ apiKey: "sk-test-secret" });
    const res = await post({ clearApiKey: true });

    expect((await res.json()).llm.hasApiKey).toBe(false);
    expect(getLLMSettings().apiKey).toBe("");
  });

  it("reports hasApiKey false when no key is stored or set in the environment", async () => {
    const body = await (await GET()).json();
    expect(body.llm.hasApiKey).toBe(false);
  });

  it("stores Claude settings without ever returning the Claude key", async () => {
    const res = await post({
      provider: "anthropic",
      anthropicApiKey: "sk-ant-test-secret",
      anthropicModel: "claude-sonnet-5-5",
      anthropicEffort: "medium",
    });
    const text = await res.text();
    expect(text).not.toContain("sk-ant-test-secret");
    expect(JSON.parse(text).llm).toMatchObject({
      provider: "anthropic",
      anthropicModel: "claude-sonnet-5-5",
      anthropicEffort: "medium",
      hasAnthropicApiKey: true,
      enabled: true,
    });
    expect(getLLMSettings().anthropicApiKey).toBe("sk-ant-test-secret");

    await post({ anthropicApiKey: "" });
    expect(getLLMSettings().anthropicApiKey).toBe("sk-ant-test-secret");
    await post({ clearAnthropicApiKey: true });
    expect(getLLMSettings().anthropicApiKey).toBe("");
  });

  it("rejects an unknown provider or effort level", async () => {
    expect((await post({ provider: "gpt" })).status).toBe(400);
    expect((await post({ anthropicEffort: "max" })).status).toBe(400);
  });
});
