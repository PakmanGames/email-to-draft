import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractionErrorCode } from "@/lib/contracts";
import { MAX_EMAIL_CHARS } from "@/lib/contracts";
import { PasteForm } from "./paste-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const extractionId = "22222222-2222-4222-8222-222222222222";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  // shouldAdvanceTime lets Testing Library's own short waits run; tests jump ahead with `advance`.
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
  });
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** A fetch that never answers on its own and rejects like the browser when aborted. */
function hangingFetch(): typeof fetch {
  return (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
}

function failure(code: ExtractionErrorCode, retryAfterSeconds: number | null = null, retryable = true) {
  return json(code === "RATE_LIMITED" ? 429 : 502, {
    ok: false,
    extractionId,
    error: { code, message: "server message", retryable, retryAfterSeconds },
  });
}

async function pasteAndExtract(text = "Please quote 10 x MS9556-82") {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<PasteForm />);
  await user.click(screen.getByRole("textbox", { name: "RFQ email" }));
  await user.paste(text);
  await user.click(screen.getByRole("button", { name: "Extract" }));
  return user;
}

const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

describe("input checks before calling the model", () => {
  it("keeps Extract disabled for an empty or whitespace-only email", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PasteForm />);
    expect(screen.getByRole("button", { name: "Extract" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("textbox", { name: "RFQ email" }));
    await user.paste("   \n  ");
    expect(screen.getByRole("button", { name: "Extract" })).toHaveProperty("disabled", true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts characters and rejects an oversized email", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PasteForm />);
    await user.click(screen.getByRole("textbox", { name: "RFQ email" }));
    await user.paste("x".repeat(MAX_EMAIL_CHARS + 5));

    expect(screen.getByText("20,005 / 20,000 characters")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("5 characters over the limit");
    expect(screen.getByRole("button", { name: "Extract" })).toHaveProperty("disabled", true);
  });
});

describe("waiting", () => {
  it("shows elapsed seconds and Cancel, and Cancel keeps the email", async () => {
    fetchMock.mockImplementation(hangingFetch());
    const user = await pasteAndExtract();

    expect(screen.getByText("Extracting line items")).toBeTruthy();
    expect(screen.getByText("0 s")).toBeTruthy();
    await advance(3_100);
    expect(screen.getByText("3 s")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Extraction cancelled. Your email is still here.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "RFQ email" })).toHaveProperty("value", "Please quote 10 x MS9556-82");
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("stops at 30 seconds with a timeout and Retry", async () => {
    fetchMock.mockImplementation(hangingFetch());
    await pasteAndExtract();
    await advance(30_000);

    expect(screen.getByRole("alert").textContent).toContain("This is taking too long.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Continue manually/ })).toBeNull();
  });
});

describe("results", () => {
  it("opens the review for a successful extraction", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, extractionId, status: "succeeded" }));
    await pasteAndExtract();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/extractions",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ emailText: "Please quote 10 x MS9556-82" }) }),
    );
    expect(push).toHaveBeenCalledWith(`/review/${extractionId}`);
    expect(screen.getByText("Opening review")).toBeTruthy();
  });

  it.each<[ExtractionErrorCode, string]>([
    ["INVALID_JSON", "We couldn't read the model's answer."],
    ["SCHEMA_MISMATCH", "We couldn't read the model's answer."],
    ["TRUNCATED", "We couldn't read the model's answer."],
    ["TIMEOUT", "This is taking too long."],
    ["PROVIDER_ERROR", "The model provider returned an error."],
    ["MODEL_UNAVAILABLE", "The model is unavailable right now."],
    ["CANCELLED", "Extraction cancelled."],
  ])("shows %s with Retry and Continue manually", async (code, title) => {
    fetchMock.mockResolvedValueOnce(failure(code));
    const user = await pasteAndExtract();

    expect(screen.getByRole("alert").textContent).toContain(title);
    expect(screen.getByRole("link", { name: /Continue manually/ }).getAttribute("href")).toBe(`/review/${extractionId}`);

    fetchMock.mockResolvedValueOnce(json(200, { ok: true, extractionId, status: "no_items" }));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith(`/review/${extractionId}`);
  });

  it("holds Retry for the rate limit's wait, with Continue manually right away", async () => {
    fetchMock.mockResolvedValueOnce(failure("RATE_LIMITED", 12));
    await pasteAndExtract();

    expect(screen.getByRole("alert").textContent).toContain("Rate limited, try again in 12 seconds.");
    expect(screen.getByRole("button", { name: "Retry in 12 s" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("link", { name: /Continue manually/ })).toBeTruthy();
    await advance(5_000);
    expect(screen.getByRole("alert").textContent).toContain("Rate limited, try again in 7 seconds.");
    await advance(7_000);
    expect(screen.getByRole("button", { name: "Retry" })).toHaveProperty("disabled", false);
  });

  it.each<[string, () => Promise<Response>, string]>([
    ["the 501 stub", () => Promise.resolve(json(501, { error: "Not implemented" })), "HTTP 501"],
    ["an HTML error page", () => Promise.resolve(new Response("<html>Bad gateway</html>", { status: 502 })), "HTTP 502"],
    ["a body that breaks the contract", () => Promise.resolve(json(200, { ok: true, extractionId: "nope" })), "HTTP 200"],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch")), "Couldn't reach the server."],
  ])("handles %s without crashing, offering Retry", async (_label, respond, text) => {
    fetchMock.mockImplementationOnce(respond);
    await pasteAndExtract();

    expect(screen.getByRole("alert").textContent).toContain(text);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Continue manually/ })).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not offer Retry when the server says retrying won't help", async () => {
    fetchMock.mockResolvedValueOnce(failure("INPUT_TOO_LARGE", null, false));
    await pasteAndExtract();
    expect(screen.getByRole("alert").textContent).toContain("This email is too long.");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
