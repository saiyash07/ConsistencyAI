// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { AppStateProvider } from "../src/state/AppState";

const KEY = "AIza-FRONTEND-SECRET-123";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppStateProvider><App /></AppStateProvider>
    </MemoryRouter>
  );
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("New analysis form", () => {
  it("starts with two responses, adds up to 10, and removal stops at 2", async () => {
    const u = userEvent.setup();
    renderAt("/analyze");
    expect(screen.getAllByTestId("response-card")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Remove/ })[0]).toBeDisabled();
    for (let i = 0; i < 8; i++) await u.click(screen.getByRole("button", { name: /Add response/ }));
    expect(screen.getAllByTestId("response-card")).toHaveLength(10);
    expect(screen.getByRole("button", { name: /Add response/ })).toBeDisabled();
    await u.click(screen.getAllByRole("button", { name: /^Remove/ })[0]);
    expect(screen.getAllByTestId("response-card")).toHaveLength(9);
  });

  it("shows validation messages for empty input instead of running", async () => {
    const u = userEvent.setup();
    renderAt("/analyze");
    await u.click(screen.getByRole("button", { name: /Run analysis/ }));
    expect(await screen.findByText(/original question is required/i)).toBeInTheDocument();
    expect(screen.getAllByText(/is empty/i).length).toBeGreaterThan(0);
  });

  it("flags duplicate responses", async () => {
    const u = userEvent.setup();
    renderAt("/analyze");
    await u.type(screen.getByLabelText(/Original question/), "Capital?");
    const boxes = screen.getAllByLabelText(/Response text/);
    await u.type(boxes[0], "Canberra is the capital.");
    await u.type(boxes[1], "canberra is the capital.");
    await u.click(screen.getByRole("button", { name: /Run analysis/ }));
    expect(await screen.findByText(/duplicates/i)).toBeInTheDocument();
  });

  it("runs a native analysis end-to-end (no network) and renders results", async () => {
    const u = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderAt("/analyze");
    await u.type(screen.getByLabelText(/Original question/), "What is the capital of Australia?");
    const boxes = screen.getAllByLabelText(/Response text/);
    await u.type(boxes[0], "Canberra is the capital of Australia.");
    await u.type(boxes[1], "Sydney is the capital of Australia.");
    await u.click(screen.getByRole("button", { name: /Run analysis/ }));
    expect(await screen.findByTestId("overall-value", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Rule-based candidate disagreements/)).toBeInTheDocument();
    expect(screen.getAllByText(/Unavailable/).length).toBeGreaterThanOrEqual(2); // semantic + claim
    expect(screen.getByRole("button", { name: /Download report/ })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    // history persisted without any credential field
    expect(localStorage.getItem("consistency-ai:history:v1")).toContain("Canberra");
  });
});

describe("Demo playground", () => {
  it("lists the three scenarios and loads one into the form", async () => {
    const u = userEvent.setup();
    renderAt("/demo");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    const card = screen.getByTestId("scenario-structural-consistency");
    await u.click(within(card).getByRole("button", { name: /Load into form/ }));
    expect(await screen.findByDisplayValue("Explain three major advantages of renewable energy.")).toBeInTheDocument();
    expect(screen.getAllByTestId("response-card")).toHaveLength(4);
  });
});

describe("Settings: provider keys", () => {
  it("masks the key, tests the connection through the backend, and Disconnect clears it", async () => {
    const u = userEvent.setup();
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true, models: ["gemini-2.5-flash", "gemini-x"], supportsEmbeddings: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    renderAt("/settings");
    const input = screen.getAllByLabelText("API key")[0] as HTMLInputElement;
    expect(input.type).toBe("password");
    await u.type(input, KEY);
    await u.click(screen.getAllByRole("button", { name: /Test connection/ })[0]);
    expect(await screen.findByText(/Key verified/)).toBeInTheDocument();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/test-connection");
    expect(JSON.parse(init.body as string).provider.apiKey).toBe(KEY);
    // never persisted
    for (const store of [localStorage, sessionStorage])
      for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i)!)).not.toContain(KEY);
    await u.click(screen.getByRole("button", { name: /Disconnect/ }));
    expect((screen.getAllByLabelText("API key")[0] as HTMLInputElement).value).toBe("");
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
  });

  it("shows a clear error for invalid credentials", async () => {
    const u = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "auth", message: "Authentication failed (check the API key)" } }), { status: 401 })));
    renderAt("/settings");
    await u.type(screen.getAllByLabelText("API key")[1], "gsk_badbadbadbad");
    await u.click(screen.getAllByRole("button", { name: /Test connection/ })[1]);
    expect(await screen.findByText(/Authentication failed/)).toBeInTheDocument();
  });

  it("explains Ollama connectivity problems and does not call the server", async () => {
    const u = userEvent.setup();
    const fetchSpy = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchSpy);
    renderAt("/settings");
    const buttons = screen.getAllByRole("button", { name: /Test connection/ });
    await u.click(buttons[buttons.length - 1]);
    expect(await screen.findByText(/OLLAMA_ORIGINS/, { selector: "div, p" })).toBeInTheDocument();
    expect((fetchSpy.mock.calls as unknown as [string][]).every(([url]) => url.startsWith("http://localhost:11434"))).toBe(true);
  });
});

describe("Reports & dashboard", () => {
  it("shows honest empty states (no fake statistics)", () => {
    renderAt("/dashboard");
    expect(screen.getByTestId("total-evals")).toHaveTextContent("0");
    expect(screen.getByText(/No evaluations yet/)).toBeInTheDocument();
    cleanup();
    renderAt("/reports");
    expect(screen.getByText(/No saved evaluations yet/)).toBeInTheDocument();
  });

  it("downloads a report for a saved evaluation", async () => {
    const u = userEvent.setup();
    renderAt("/analyze");
    await u.type(screen.getByLabelText(/Original question/), "Q?");
    const boxes = screen.getAllByLabelText(/Response text/);
    await u.type(boxes[0], "Alpha beta gamma.");
    await u.type(boxes[1], "Delta epsilon zeta.");
    await u.click(screen.getByRole("button", { name: /Run analysis/ }));
    await screen.findByTestId("overall-value");
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await u.click(screen.getByRole("button", { name: /Download report/ }));
    await waitFor(() => expect(blob).toBeDefined());
    const html = await blob!.text();
    expect(html).toContain("Consistency AI");
    expect(html).toContain("Alpha beta gamma.");
  });
});
